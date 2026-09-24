/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0070 §5-6, spec 159 RF8-RF10 (T7): busca e agrupa as entregas que pesam na nota do
 * motorista. A regra (quais penalizam, quantos pontos, `null` sem histórico) mora em
 * `computeDriverScore`; aqui só se lê o banco — uma consulta de entregas para a lista inteira de
 * motoristas (sem N+1) e as duas leituras de configuração da empresa, em paralelo.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { timestamptzParameter } from '../../database/sql-timestamptz-parameter.support.js'
import {
  companyDeliveryProofSettings,
  deliveryProofSettingOverrides,
} from '../../database/company-delivery-proof-settings.schema.js'
import { fleetDrivers } from '../../database/fleet.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import {
  TRIP_FIELD_CHANNELS,
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
} from '../../database/trip.schema.js'
import {
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  resolveProofSettingsForRecipient,
  type ProofSettingsLookup,
} from '../../trips/domain/delivery-proof-settings.policy.js'
import type { DriverScorePort } from '../application/driver-score.port.js'
import { MILLISECONDS_PER_DAY } from '../../shared/time.constant.js'
import {
  DELIVERED_EVENT_KIND,
  PHOTO_PROOF_KIND,
  RECIPIENT_PARTICIPANT_ROLE,
} from '../../trips/domain/delivery-event.constant.js'
import {
  computeDriverScore,
  DRIVER_SCORE_WINDOW_DAYS,
  type DriverScoreDelivery,
  type DriverScoreResult,
  type DriverScoreSettings,
} from '../domain/driver-score.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const RETURNED_DOCUMENT_STATUS = 'returned'

type ReadScoresInput = Parameters<DriverScorePort['readScores']>[0]

type DeliveryRow = {
  readonly capturedAt: Date | null
  readonly documentNumber: string | null
  readonly driverId: string
  readonly punctuality: DriverScoreDelivery['photoPunctuality'] | null
  readonly recipientTaxId: string | null
  readonly recordedAt: Date
  readonly tripDocumentId: string
}

type ScoreSettings = {
  /** Spec 159 T11 (D1): o corte de ativação da nota — `undefined` sem linha de configuração. */
  readonly effectiveSince: Date | undefined
  readonly lookup: ProofSettingsLookup
  readonly score: DriverScoreSettings
}

export class DrizzleDriverScoreRepository implements DriverScorePort {
  public constructor(private readonly database: Database) {}

  public async readScores(input: ReadScoresInput): Promise<ReadonlyMap<string, number | null>> {
    const results = await this.computeResults(input)

    return new Map([...results].map(([driverId, result]) => [driverId, result.score]))
  }

  public async readPenalties(input: {
    readonly companyId: string
    readonly driverId: string
    readonly now: Date
  }): Promise<DriverScoreResult> {
    const results = await this.computeResults({
      companyId: input.companyId,
      driverIds: [input.driverId],
      now: input.now,
    })

    return results.get(input.driverId) ?? { penalties: [], score: null }
  }

  private async computeResults(input: ReadScoresInput): Promise<Map<string, DriverScoreResult>> {
    if (input.driverIds.length === 0) return new Map()

    const [rows, settings] = await Promise.all([
      this.listDeliveries(input),
      this.readSettings(input.companyId),
    ])
    const deliveriesByDriver = groupDeliveriesByDriver({ lookup: settings.lookup, rows })

    return new Map(
      input.driverIds.map((driverId) => [
        driverId,
        computeDriverScore({
          deliveries: deliveriesByDriver.get(driverId) ?? [],
          ...(settings.effectiveSince === undefined
            ? {}
            : { effectiveSince: settings.effectiveSince }),
          now: input.now,
          settings: settings.score,
        }),
      ]),
    )
  }

  /**
   * O motorista do evento é `on_behalf_of_driver_id` (escritório), `reported_by_driver_id` (app e
   * WhatsApp, gravado no evento — spec 159 T11) ou, no evento anterior a essa coluna, o cadastro de
   * frota ligado ao vínculo de `actor_user_id`. Toda tabela do join carrega o `company_id` do
   * contexto.
   */
  private async listDeliveries(input: ReadScoresInput): Promise<readonly DeliveryRow[]> {
    const lastDelivery = buildLastDeliverySubquery({ database: this.database, ...input })
    const on = buildTenantJoinConditions({ companyId: input.companyId, lastDelivery })
    const driverId = sql<string>`coalesce(${lastDelivery.onBehalfOfDriverId}, ${lastDelivery.reportedByDriverId}, ${fleetDrivers.id})`

    return this.database
      .select({
        capturedAt: lastDelivery.capturedAt,
        documentNumber: nfeDocuments.number,
        driverId,
        punctuality: tripDeliveryProofs.punctuality,
        recipientTaxId: nfeParticipants.taxId,
        recordedAt: lastDelivery.recordedAt,
        tripDocumentId: tripDocuments.id,
      })
      .from(lastDelivery)
      .innerJoin(tripDocuments, on.tripDocument)
      .leftJoin(userCompanyMemberships, on.membership)
      .leftJoin(fleetDrivers, on.driver)
      .leftJoin(nfeDocuments, on.nfeDocument)
      .leftJoin(nfeParticipants, on.recipient)
      .leftJoin(tripDeliveryProofs, on.photo)
      .where(
        and(
          /**
           * Spec 159 T11 (decisão D2): só o app do motorista entra na nota. O escritório já é
           * obrigado a mandar a foto na baixa, e o WhatsApp não será liberado agora — ele continua
           * calculando `proofPending`, mas não pesa.
           */
          eq(lastDelivery.channel, TRIP_FIELD_CHANNELS.driverApp),
          ne(tripDocuments.separationStatus, RETURNED_DOCUMENT_STATUS),
          inArray(driverId, [...input.driverIds]),
        ),
      )
  }

  /**
   * A exceção por CNPJ decide o modo `photo` **atual** de cada nota (RF8, casos extremos); os
   * parâmetros de pontos e prazo são só da configuração geral. Sem linha, a fábrica.
   */
  private async readSettings(companyId: string): Promise<ScoreSettings> {
    const [generalRows, overrideRows] = await Promise.all([
      this.database
        .select()
        .from(companyDeliveryProofSettings)
        .where(eq(companyDeliveryProofSettings.companyId, companyId))
        .limit(1),
      this.database
        .select()
        .from(deliveryProofSettingOverrides)
        .where(eq(deliveryProofSettingOverrides.companyId, companyId)),
    ])
    const general = generalRows[0]

    return {
      effectiveSince: general?.scoreEffectiveSince,
      lookup: {
        general: general ?? null,
        overridesByTaxId: new Map(overrideRows.map((row) => [row.taxId, row])),
      },
      score: general ?? DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
    }
  }
}

/**
 * RF8: o **último** evento `delivered` de cada nota nos 90 dias (a correção de uma entrega gera
 * outro evento, e só o mais recente conta). O recorte de canal e de motorista fica **fora** do
 * `distinct on`: se a última entrega foi do escritório, a nota sai da nota do motorista, mesmo que
 * um evento anterior tenha sido dele.
 *
 * Spec 159 T11 (item 7): o `distinct on` só roda sobre as notas que têm **alguma** entrega dos
 * motoristas pedidos na janela (`buildRequestedDriverDocuments`) — a ficha de um motorista não
 * varre mais a empresa inteira, e o "último evento" continua sendo o da nota, de qualquer autor.
 */
function buildLastDeliverySubquery(input: ReadScoresInput & { readonly database: Database }) {
  const windowStart = new Date(
    input.now.getTime() - DRIVER_SCORE_WINDOW_DAYS * MILLISECONDS_PER_DAY,
  )

  return input.database
    .selectDistinctOn([tripStopEvents.tripDocumentId], {
      actorUserId: tripStopEvents.actorUserId,
      capturedAt: tripStopEvents.capturedAt,
      channel: tripStopEvents.channel,
      eventId: tripStopEvents.id,
      onBehalfOfDriverId: tripStopEvents.onBehalfOfDriverId,
      recordedAt: tripStopEvents.recordedAt,
      reportedByDriverId: tripStopEvents.reportedByDriverId,
      tripDocumentId: tripStopEvents.tripDocumentId,
    })
    .from(tripStopEvents)
    .where(
      and(
        eq(tripStopEvents.companyId, input.companyId),
        eq(tripStopEvents.kind, DELIVERED_EVENT_KIND),
        gte(
          sql`coalesce(${tripStopEvents.capturedAt}, ${tripStopEvents.recordedAt})`,
          timestamptzParameter(windowStart),
        ),
        inArray(
          tripStopEvents.tripDocumentId,
          buildRequestedDriverDocuments({ ...input, windowStart }),
        ),
      ),
    )
    .orderBy(tripStopEvents.tripDocumentId, desc(tripStopEvents.createdAt), desc(tripStopEvents.id))
    .as('last_delivery')
}

/**
 * As notas com entrega de um dos motoristas pedidos na janela — pela mesma atribuição da leitura
 * (`on_behalf_of_driver_id`, `reported_by_driver_id` ou, no evento antigo sem nenhum dos dois, a
 * conta ligada ao cadastro). Tenant em todas as tabelas.
 */
function buildRequestedDriverDocuments(
  input: ReadScoresInput & { readonly database: Database; readonly windowStart: Date },
) {
  const driverEvent = alias(tripStopEvents, 'driver_delivery')
  const driverIds = [...input.driverIds]
  const driverAccounts = input.database
    .select({ userId: userCompanyMemberships.userId })
    .from(fleetDrivers)
    .innerJoin(
      userCompanyMemberships,
      and(
        eq(userCompanyMemberships.companyId, input.companyId),
        eq(userCompanyMemberships.id, fleetDrivers.membershipId),
      ),
    )
    .where(and(eq(fleetDrivers.companyId, input.companyId), inArray(fleetDrivers.id, driverIds)))

  return input.database
    .select({ tripDocumentId: driverEvent.tripDocumentId })
    .from(driverEvent)
    .where(
      and(
        eq(driverEvent.companyId, input.companyId),
        eq(driverEvent.kind, DELIVERED_EVENT_KIND),
        gte(
          sql`coalesce(${driverEvent.capturedAt}, ${driverEvent.recordedAt})`,
          timestamptzParameter(input.windowStart),
        ),
        or(
          inArray(driverEvent.onBehalfOfDriverId, driverIds),
          inArray(driverEvent.reportedByDriverId, driverIds),
          and(
            isNull(driverEvent.onBehalfOfDriverId),
            isNull(driverEvent.reportedByDriverId),
            inArray(driverEvent.actorUserId, driverAccounts),
          ),
        ),
      ),
    )
}

type LastDeliverySubquery = ReturnType<typeof buildLastDeliverySubquery>

/** Tenant em **todas** as tabelas do join, pelo `companyId` do contexto — nunca herdado do evento. */
function buildTenantJoinConditions(input: {
  readonly companyId: string
  readonly lastDelivery: LastDeliverySubquery
}) {
  const { companyId, lastDelivery } = input

  return {
    driver: and(
      eq(fleetDrivers.companyId, companyId),
      eq(fleetDrivers.membershipId, userCompanyMemberships.id),
    ),
    membership: and(
      eq(userCompanyMemberships.companyId, companyId),
      eq(userCompanyMemberships.userId, lastDelivery.actorUserId),
    ),
    nfeDocument: and(
      eq(nfeDocuments.companyId, companyId),
      eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
    ),
    photo: and(
      eq(tripDeliveryProofs.companyId, companyId),
      eq(tripDeliveryProofs.stopEventId, lastDelivery.eventId),
      eq(tripDeliveryProofs.kind, PHOTO_PROOF_KIND),
    ),
    recipient: and(
      eq(nfeParticipants.companyId, companyId),
      eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
      eq(nfeParticipants.role, RECIPIENT_PARTICIPANT_ROLE),
    ),
    tripDocument: and(
      eq(tripDocuments.companyId, companyId),
      eq(tripDocuments.id, lastDelivery.tripDocumentId),
    ),
  }
}

function groupDeliveriesByDriver(input: {
  readonly lookup: ProofSettingsLookup
  readonly rows: readonly DeliveryRow[]
}): Map<string, DriverScoreDelivery[]> {
  const deliveriesByDriver = new Map<string, DriverScoreDelivery[]>()

  for (const row of input.rows) {
    const settings = resolveProofSettingsForRecipient({
      lookup: input.lookup,
      recipientTaxId: row.recipientTaxId ?? '',
    })
    const delivery: DriverScoreDelivery = {
      deliveredAt: row.capturedAt ?? row.recordedAt,
      documentNumber: row.documentNumber ?? '',
      photoMode: settings.photo,
      photoPunctuality: row.punctuality ?? undefined,
      tripDocumentId: row.tripDocumentId,
    }
    const deliveries = deliveriesByDriver.get(row.driverId) ?? []
    deliveries.push(delivery)
    deliveriesByDriver.set(row.driverId, deliveries)
  }

  return deliveriesByDriver
}
