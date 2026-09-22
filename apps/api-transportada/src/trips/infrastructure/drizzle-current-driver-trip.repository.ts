/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'

import {
  companyDeliveryProofSettings,
  deliveryProofSettingOverrides,
} from '../../database/company-delivery-proof-settings.schema.js'
import { fleetDrivers, fleetVehicles } from '../../database/fleet.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { nfeDocuments, nfeParticipants, nfeVolumes } from '../../database/nfe.schema.js'
import {
  tripDeliveryProofs,
  tripDocuments,
  tripDrivers,
  tripStopEvents,
  tripStops,
  trips,
} from '../../database/trip.schema.js'
import { tripStopSchedules } from '../../database/delivery-client.schema.js'
import { mdfeFiscalDocuments, mdfeManifests } from '../../database/mdfe.schema.js'
import { DRIVER_SCORE_WINDOW_DAYS } from '../../fleet/domain/driver-score.policy.js'
import { MILLISECONDS_PER_DAY } from '../../shared/time.constant.js'
import { FIELD_TRIP_TARGET_KIND } from '../application/field-trip-target.types.js'
import type {
  CurrentDriverTripPort,
  DriverPendingProof,
  DriverStopSchedule,
  DriverTrip,
  DriverTripManifest,
  DriverTripDocument,
  DriverTripStop,
} from '../application/find-current-driver-trip.use-case.js'
import {
  resolveProofSettingsForRecipient,
  type ProofSettingsLookup,
} from '../domain/delivery-proof-settings.policy.js'
import {
  DELIVERED_DOCUMENT_STATUS,
  DELIVERED_EVENT_KIND,
  PHOTO_PROOF_KIND,
  RECIPIENT_PARTICIPANT_ROLE,
  REQUIRED_PROOF_FIELD_MODE,
} from '../domain/delivery-event.constant.js'
import { TRIP_FIELD_CHANNELS } from '../domain/trip-field-channel.constant.js'
import { fieldTripTargetCondition } from './field-trip-target.query.js'
import type { TripDatabase } from './trip-queryable.type.js'
import { TRIP_DISPATCHED_STATUSES, TRIP_ON_ROAD_STATUSES } from '../domain/trip-state.policy.js'
import type { TripStatus } from '../../database/trip.schema.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import type { TripFieldOfficeAuditInput } from '../application/trip-field-office-audit.port.js'
import { insertTripFieldOfficeAudit } from './trip-field-office-audit.persistence.js'
import { recordTripStatusChange } from './trip-status-event.persistence.js'

/**
 * As fases em que a viagem aparece na tela do motorista.
 *
 * ⚠️ **Não é `TRIP_ON_ROAD_STATUSES`, e a diferença é `route_planned`.** A rua começa em
 * `dispatched`; a **tela do motorista** começa um passo antes, porque é ele quem despacha pelo app
 * (ADR-0058) — sem ver a viagem planejada, ele não teria o que despachar. Trocar esta lista pela da
 * rua deixaria a rota de despacho inalcançável, e o defeito seria "a viagem não aparece", longe da
 * linha que o causou.
 *
 * O resto vem importado, nunca redigitado: é a lição das cinco cópias que divergiram.
 */
const CURRENT_DRIVER_TRIP_STATUSES = ['route_planned', ...TRIP_ON_ROAD_STATUSES] as const

/** A nota do destinatário é o que o motorista entrega; a do emitente não lhe diz nada. */
const RECIPIENT_ROLE = RECIPIENT_PARTICIPANT_ROLE

/** Encerrado ainda se apresenta; cancelado, não. Mesma regra da consulta do documento. */
const PRINTABLE_DOCUMENT_STATUSES = ['authorized', 'closed'] as const

export class DrizzleCurrentDriverTripRepository implements CurrentDriverTripPort {
  public constructor(private readonly database: TripDatabase) {}

  public async findDriverIdByMembership(input: {
    readonly companyId: string
    readonly membershipId: string
  }): Promise<string | null> {
    const [record] = await this.database
      .select({ id: fleetDrivers.id })
      .from(fleetDrivers)
      .where(
        and(
          eq(fleetDrivers.companyId, input.companyId),
          eq(fleetDrivers.membershipId, input.membershipId),
        ),
      )
      .limit(1)

    return record?.id ?? null
  }

  /** ADR-0058: o recorte da rota de despacho do motorista é o vínculo, e ele se prova aqui. */
  public async isTripOfDriver(input: {
    readonly companyId: string
    readonly driverId: string
    readonly tripId: string
  }): Promise<boolean> {
    const [record] = await this.database
      .select({ tripId: tripDrivers.tripId })
      .from(tripDrivers)
      .where(
        and(
          eq(tripDrivers.companyId, input.companyId),
          eq(tripDrivers.driverId, input.driverId),
          eq(tripDrivers.tripId, input.tripId),
        ),
      )
      .limit(1)

    return record !== undefined
  }

  /**
   * ADR-0058: a viagem que os dois toques do campo alcançam. Devolve a **primeira** ativa, na mesma
   * ordem de `listActiveTrips` — com dois despachos simultâneos, conferir a carga vale para a que a
   * tela está mostrando, e a segunda tem a conferência dela.
   */
  public async readCurrent(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<{ readonly tripId: string; readonly tripStatus: TripStatus } | null> {
    const [record] = await this.database
      .select({ status: trips.status, tripId: trips.id })
      .from(tripDrivers)
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDrivers.companyId), eq(trips.id, tripDrivers.tripId)),
      )
      .where(
        and(
          eq(tripDrivers.companyId, input.companyId),
          eq(tripDrivers.driverId, input.driverId),
          inArray(trips.status, [...CURRENT_DRIVER_TRIP_STATUSES]),
        ),
      )
      .orderBy(asc(trips.createdAt))
      .limit(1)

    return record === undefined ? null : { tripId: record.tripId, tripStatus: record.status }
  }

  public async readStatus(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStatus | null> {
    const [record] = await this.database
      .select({ status: trips.status })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)

    return record?.status ?? null
  }

  /**
   * O `where` leva `company_id` junto do id: viagem de outra empresa é ausência, nunca escrita. E
   * leva o status que a decisão leu (compare-and-set): a viagem que concluiu entre a leitura e a
   * gravação não regride para `in_transit`.
   */
  public async updateStatus(input: {
    readonly actorUserId: string
    readonly audit?: TripFieldOfficeAuditInput
    readonly channel: TripFieldChannel
    readonly companyId: string
    readonly expectedStatus: TripStatus
    readonly onBehalfOfDriverId: string | null
    readonly tripId: string
    readonly tripStatus: TripStatus
  }): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const updated = await transaction
        .update(trips)
        .set({ status: input.tripStatus, updatedAt: sql`now()` })
        .where(
          and(
            eq(trips.companyId, input.companyId),
            eq(trips.id, input.tripId),
            eq(trips.status, input.expectedStatus),
          ),
        )
        .returning({ id: trips.id })

      if (updated.length === 0) return false

      await recordTripStatusChange(transaction, {
        actorUserId: input.actorUserId,
        channel: input.channel,
        companyId: input.companyId,
        fromStatus: input.expectedStatus,
        onBehalfOfDriverId: input.onBehalfOfDriverId,
        toStatus: input.tripStatus,
        tripId: input.tripId,
      })
      if (input.audit !== undefined) await insertTripFieldOfficeAudit(transaction, input.audit)

      return true
    })
  }

  public async listActiveTrips(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly DriverTrip[]> {
    const tripRows = await this.database
      .select({ id: trips.id, plate: fleetVehicles.plate, status: trips.status })
      .from(tripDrivers)
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDrivers.companyId), eq(trips.id, tripDrivers.tripId)),
      )
      .innerJoin(
        fleetVehicles,
        and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
      )
      .where(
        and(
          eq(tripDrivers.companyId, input.companyId),
          eq(tripDrivers.driverId, input.driverId),
          inArray(trips.status, [...CURRENT_DRIVER_TRIP_STATUSES]),
        ),
      )
      .orderBy(asc(trips.createdAt))

    if (tripRows.length === 0) return []

    const tripIds = tripRows.map((row) => row.id)
    const [stopRows, documentRows, manifestsByTrip, schedulesByStop, proofSettings] =
      await Promise.all([
        this.listStops({ companyId: input.companyId, tripIds }),
        this.listDocuments({ companyId: input.companyId, tripIds }),
        this.listManifests({ companyId: input.companyId, tripIds }),
        this.listSchedules({ companyId: input.companyId, tripIds }),
        this.readProofSettings({ companyId: input.companyId }),
      ])

    /**
     * Volume é 1..N por nota: somar no banco, numa consulta só, evita trazer cem linhas para contar
     * três. Nota sem volume importado é caso normal — a NF-e é dado de terceiro, e nós não a
     * preenchemos.
     */
    const [volumesByDocument, photoPresenceByDocument] = await Promise.all([
      this.sumVolumes({
        companyId: input.companyId,
        nfeDocumentIds: documentRows
          .map((row) => row.nfeDocumentId)
          .filter((documentId): documentId is string => documentId !== null),
      }),
      this.listDeliveryPhotoPresence({
        companyId: input.companyId,
        documentIds: documentRows.map((row) => row.id),
      }),
    ])
    const documentsByStop = groupBy(
      documentRows.map((row) => ({
        ...row,
        hasDeliveryPhoto: photoPresenceByDocument.get(row.id) ?? false,
        volumes: volumesByDocument.get(row.nfeDocumentId ?? '') ?? null,
      })),
      (row) => row.stopId,
    )
    const stopsByTrip = groupBy(stopRows, (row) => row.tripId)

    return tripRows.map((trip) => ({
      id: trip.id,
      manifest: manifestsByTrip.get(trip.id) ?? null,
      status: trip.status,
      stops: (stopsByTrip.get(trip.id) ?? []).map((stop) =>
        toDriverStop(stop, documentsByStop, schedulesByStop, proofSettings),
      ),
      vehiclePlate: trip.plate,
    }))
  }

  /**
   * Spec 159 T11 (ALTO 1): as notas que **este** motorista entregou nos 90 dias, com foto
   * obrigatória resolvida e sem foto no último `delivered`, em qualquer viagem que o `/proof` ainda
   * alcança (`TRIP_DISPATCHED_STATUSES`, inclusive `completed`, e o mesmo recorte de tripulação de
   * `findDeliveryEventId`). O último evento é o da nota, de qualquer autor; quem ele é se decide
   * depois — se o escritório deu a baixa, a pendência não é do motorista.
   */
  public async listPendingProofs(input: {
    readonly companyId: string
    readonly driverId: string
    readonly now: Date
  }): Promise<readonly DriverPendingProof[]> {
    const windowStart = new Date(
      input.now.getTime() - DRIVER_SCORE_WINDOW_DAYS * MILLISECONDS_PER_DAY,
    )
    const [rows, accountUserId, proofSettings, effectiveSince] = await Promise.all([
      this.listLastDeliveries({ ...input, windowStart }),
      this.findDriverAccountUserId(input),
      this.readProofSettings({ companyId: input.companyId }),
      this.readScoreEffectiveSince({ companyId: input.companyId }),
    ])

    return rows.flatMap((row) => {
      const deliveredAt = row.capturedAt ?? row.recordedAt
      // Spec 159 T11 (D1): o mesmo corte da nota — a pendência de antes da regra não pesa nem aparece.
      if (effectiveSince !== undefined && deliveredAt < effectiveSince) return []
      const isOwnDelivery =
        row.channel !== TRIP_FIELD_CHANNELS.office &&
        (row.reportedByDriverId === input.driverId ||
          (row.reportedByDriverId === null && row.actorUserId === accountUserId))
      if (!isOwnDelivery || row.hasPhoto || row.separationStatus !== DELIVERED_DOCUMENT_STATUS)
        return []

      const deliveryProof = resolveProofSettingsForRecipient({
        lookup: proofSettings,
        recipientTaxId: row.recipientTaxId ?? '',
      })
      if (deliveryProof.photo !== REQUIRED_PROOF_FIELD_MODE) return []

      return [
        {
          deliveredAt: deliveredAt.toISOString(),
          deliveryProof,
          documentId: row.tripDocumentId,
          documentNumber: row.documentNumber ?? '',
          documentSeries: row.documentSeries ?? '',
          recipientName: row.recipientName ?? '',
          tripId: row.tripId,
          tripStatus: row.tripStatus,
        },
      ]
    })
  }

  /** Spec 159 T11 (D1): o corte de ativação da nota — `undefined` sem linha de configuração. */
  private async readScoreEffectiveSince(input: {
    readonly companyId: string
  }): Promise<Date | undefined> {
    const [record] = await this.database
      .select({ scoreEffectiveSince: companyDeliveryProofSettings.scoreEffectiveSince })
      .from(companyDeliveryProofSettings)
      .where(eq(companyDeliveryProofSettings.companyId, input.companyId))
      .limit(1)

    return record?.scoreEffectiveSince
  }

  /** A conta ligada hoje ao cadastro — só para o evento antigo, sem `reported_by_driver_id`. */
  private async findDriverAccountUserId(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<string | null> {
    const [record] = await this.database
      .select({ userId: userCompanyMemberships.userId })
      .from(fleetDrivers)
      .innerJoin(
        userCompanyMemberships,
        and(
          eq(userCompanyMemberships.companyId, fleetDrivers.companyId),
          eq(userCompanyMemberships.id, fleetDrivers.membershipId),
        ),
      )
      .where(and(eq(fleetDrivers.companyId, input.companyId), eq(fleetDrivers.id, input.driverId)))
      .limit(1)

    return record?.userId ?? null
  }

  /**
   * O último `delivered` de cada nota da janela nas viagens da tripulação deste motorista, com o
   * autor, a nota fiscal e se a foto chegou. O desempate é o mesmo da nota do motorista
   * (`created_at`, depois `id`). Toda tabela com o `company_id` do contexto.
   */
  private async listLastDeliveries(input: {
    readonly companyId: string
    readonly driverId: string
    readonly windowStart: Date
  }) {
    return this.database
      .selectDistinctOn([tripStopEvents.tripDocumentId], {
        actorUserId: tripStopEvents.actorUserId,
        capturedAt: tripStopEvents.capturedAt,
        channel: tripStopEvents.channel,
        documentNumber: nfeDocuments.number,
        documentSeries: nfeDocuments.series,
        hasPhoto: sql<boolean>`${tripDeliveryProofs.id} is not null`,
        recipientName: nfeParticipants.legalName,
        recipientTaxId: nfeParticipants.taxId,
        recordedAt: tripStopEvents.recordedAt,
        reportedByDriverId: tripStopEvents.reportedByDriverId,
        separationStatus: tripDocuments.separationStatus,
        tripDocumentId: tripDocuments.id,
        tripId: trips.id,
        tripStatus: trips.status,
      })
      .from(tripStopEvents)
      .innerJoin(
        tripDocuments,
        and(
          eq(tripDocuments.companyId, tripStopEvents.companyId),
          eq(tripDocuments.id, tripStopEvents.tripDocumentId),
        ),
      )
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
      )
      .leftJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.companyId, tripDocuments.companyId),
          eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
        ),
      )
      .leftJoin(
        nfeParticipants,
        and(
          eq(nfeParticipants.companyId, tripDocuments.companyId),
          eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
          eq(nfeParticipants.role, RECIPIENT_ROLE),
        ),
      )
      .leftJoin(
        tripDeliveryProofs,
        and(
          eq(tripDeliveryProofs.companyId, tripStopEvents.companyId),
          eq(tripDeliveryProofs.stopEventId, tripStopEvents.id),
          eq(tripDeliveryProofs.kind, PHOTO_PROOF_KIND),
        ),
      )
      .where(
        and(
          eq(tripStopEvents.companyId, input.companyId),
          eq(tripStopEvents.kind, DELIVERED_EVENT_KIND),
          gte(
            sql`coalesce(${tripStopEvents.capturedAt}, ${tripStopEvents.recordedAt})`,
            input.windowStart,
          ),
          inArray(trips.status, [...TRIP_DISPATCHED_STATUSES]),
          fieldTripTargetCondition({
            driverId: input.driverId,
            kind: FIELD_TRIP_TARGET_KIND.driver,
          }),
        ),
      )
      .orderBy(
        tripStopEvents.tripDocumentId,
        desc(tripStopEvents.createdAt),
        desc(tripStopEvents.id),
      )
  }

  /**
   * Uma consulta para as viagens todas, não uma por viagem: o motorista costuma levar uma, mas o
   * agregado leva três, e um `await` por viagem seria N+1 no caminho que abre a tela dele.
   *
   * Manifesto **cancelado não conta**: o índice único deixa um vivo por viagem, e imprimir o
   * cancelado seria apresentar na barreira um documento que a SEFAZ já derrubou.
   */
  private async listManifests(input: {
    readonly companyId: string
    readonly tripIds: readonly string[]
  }): Promise<Map<string, DriverTripManifest>> {
    const rows = await this.database
      .select({
        accessKey: mdfeFiscalDocuments.accessKey,
        authorizedAt: mdfeFiscalDocuments.authorizedAt,
        manifestId: mdfeManifests.id,
        protocol: mdfeFiscalDocuments.authorizationProtocol,
        tripId: mdfeManifests.tripId,
      })
      .from(mdfeManifests)
      .innerJoin(
        mdfeFiscalDocuments,
        and(
          eq(mdfeFiscalDocuments.companyId, mdfeManifests.companyId),
          eq(mdfeFiscalDocuments.manifestId, mdfeManifests.id),
          inArray(mdfeFiscalDocuments.status, [...PRINTABLE_DOCUMENT_STATUSES]),
          isNull(mdfeFiscalDocuments.cancellationRequestedAt),
        ),
      )
      .where(
        and(
          eq(mdfeManifests.companyId, input.companyId),
          inArray(mdfeManifests.tripId, [...input.tripIds]),
        ),
      )

    return new Map(
      rows.flatMap((row) =>
        row.tripId === null
          ? []
          : [
              [
                row.tripId,
                {
                  accessKey: row.accessKey,
                  authorizedAt: row.authorizedAt?.toISOString() ?? null,
                  id: row.manifestId,
                  protocol: row.protocol,
                },
              ] as const,
            ],
      ),
    )
  }

  /**
   * Spec 060 D3: a hora marcada e o protocolo da parada. Uma consulta para a viagem inteira, pelo
   * mesmo motivo do manifesto — o agregado leva três viagens, e uma consulta por parada seria N+1 no
   * caminho que abre a tela dele em 3G.
   */
  private async listSchedules(input: {
    readonly companyId: string
    readonly tripIds: readonly string[]
  }): Promise<Map<string, DriverStopSchedule>> {
    const rows = await this.database
      .select({
        protocol: tripStopSchedules.protocol,
        scheduledAt: tripStopSchedules.scheduledAt,
        status: tripStopSchedules.status,
        stopId: tripStopSchedules.stopId,
      })
      .from(tripStopSchedules)
      .where(
        and(
          eq(tripStopSchedules.companyId, input.companyId),
          inArray(tripStopSchedules.tripId, [...input.tripIds]),
        ),
      )

    return new Map(
      rows.map((row) => [
        row.stopId,
        {
          protocol: row.protocol,
          scheduledAt: row.scheduledAt?.toISOString() ?? null,
          status: row.status,
        },
      ]),
    )
  }

  private async sumVolumes(input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
  }): Promise<Map<string, VolumeTotals>> {
    if (input.nfeDocumentIds.length === 0) return new Map()

    const rows = await this.database
      .select({
        documentId: nfeVolumes.documentId,
        grossWeight: sql<string>`coalesce(sum(${nfeVolumes.grossWeight}), 0)::text`,
        quantity: sql<string>`coalesce(sum(${nfeVolumes.quantity}), 0)::text`,
      })
      .from(nfeVolumes)
      .where(
        and(
          eq(nfeVolumes.companyId, input.companyId),
          inArray(nfeVolumes.documentId, [...input.nfeDocumentIds]),
        ),
      )
      .groupBy(nfeVolumes.documentId)

    return new Map(
      rows.map((row) => [row.documentId, { grossWeight: row.grossWeight, quantity: row.quantity }]),
    )
  }

  /**
   * ADR-0057 §2: os campos do comprovante viajam **resolvidos** no snapshot. Uma consulta para a
   * geral e uma para as exceções da empresa inteira — o app não ganha rota de settings.
   */
  private async readProofSettings(input: {
    readonly companyId: string
  }): Promise<ProofSettingsLookup> {
    const [generalRows, overrideRows] = await Promise.all([
      this.database
        .select({
          photo: companyDeliveryProofSettings.photo,
          receiverDocument: companyDeliveryProofSettings.receiverDocument,
          receiverName: companyDeliveryProofSettings.receiverName,
          signature: companyDeliveryProofSettings.signature,
        })
        .from(companyDeliveryProofSettings)
        .where(eq(companyDeliveryProofSettings.companyId, input.companyId))
        .limit(1),
      this.database
        .select({
          photo: deliveryProofSettingOverrides.photo,
          receiverDocument: deliveryProofSettingOverrides.receiverDocument,
          receiverName: deliveryProofSettingOverrides.receiverName,
          signature: deliveryProofSettingOverrides.signature,
          taxId: deliveryProofSettingOverrides.taxId,
        })
        .from(deliveryProofSettingOverrides)
        .where(eq(deliveryProofSettingOverrides.companyId, input.companyId)),
    ])

    return {
      general: generalRows[0] ?? null,
      overridesByTaxId: new Map(
        overrideRows.map((row) => [
          row.taxId,
          {
            photo: row.photo,
            receiverDocument: row.receiverDocument,
            receiverName: row.receiverName,
            signature: row.signature,
          },
        ]),
      ),
    }
  }

  /**
   * ADR-0070 §1, spec 159 RF1/RF2: se o **último** evento `delivered` da nota tem foto (`kind =
   * 'photo'`). `selectDistinctOn` pega só o mais recente por nota — uma nota pode, em tese, ser
   * entregue mais de uma vez ao longo do tempo (correção), e é sempre a última que conta.
   */
  private async listDeliveryPhotoPresence(input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
  }): Promise<Map<string, boolean>> {
    if (input.documentIds.length === 0) return new Map()

    const rows = await this.database
      .selectDistinctOn([tripStopEvents.tripDocumentId], {
        hasPhoto: sql<boolean>`${tripDeliveryProofs.id} is not null`,
        tripDocumentId: tripStopEvents.tripDocumentId,
      })
      .from(tripStopEvents)
      .leftJoin(
        tripDeliveryProofs,
        and(
          eq(tripDeliveryProofs.companyId, tripStopEvents.companyId),
          eq(tripDeliveryProofs.stopEventId, tripStopEvents.id),
          eq(tripDeliveryProofs.kind, PHOTO_PROOF_KIND),
        ),
      )
      .where(
        and(
          eq(tripStopEvents.companyId, input.companyId),
          eq(tripStopEvents.kind, DELIVERED_EVENT_KIND),
          inArray(tripStopEvents.tripDocumentId, [...input.documentIds]),
        ),
      )
      // Spec 159 T11: o mesmo desempate da nota do motorista — sem o `id`, empate de `created_at`
      // deixava o snapshot e a nota lerem eventos diferentes da mesma nota.
      .orderBy(
        tripStopEvents.tripDocumentId,
        desc(tripStopEvents.createdAt),
        desc(tripStopEvents.id),
      )

    return new Map(
      rows.flatMap((row) =>
        row.tripDocumentId === null ? [] : [[row.tripDocumentId, row.hasPhoto] as const],
      ),
    )
  }

  private async listStops(input: { readonly companyId: string; readonly tripIds: string[] }) {
    return this.database
      .select({
        arrivedAt: tripStops.arrivedAt,
        completedAt: tripStops.completedAt,
        deliveryWindowEnd: tripStops.deliveryWindowEnd,
        deliveryWindowStart: tripStops.deliveryWindowStart,
        id: tripStops.id,
        label: tripStops.label,
        latitude: tripStops.latitude,
        longitude: tripStops.longitude,
        sequence: tripStops.sequence,
        tripId: tripStops.tripId,
      })
      .from(tripStops)
      .where(
        and(eq(tripStops.companyId, input.companyId), inArray(tripStops.tripId, input.tripIds)),
      )
      .orderBy(asc(tripStops.sequence))
  }

  /**
   * Nota liberada do romaneio saiu da viagem — mostrá-la ao motorista seria pedir a entrega de algo
   * que o escritório já tirou dali. O nome do destinatário entra por `left join` porque nota sem
   * participante é importação incompleta, não motivo para a parada sumir da tela.
   */
  private async listDocuments(input: { readonly companyId: string; readonly tripIds: string[] }) {
    return (
      this.database
        .select({
          accessKey: nfeDocuments.accessKey,
          deliveredAt: tripDocuments.deliveredAt,
          id: tripDocuments.id,
          nfeDocumentId: tripDocuments.nfeDocumentId,
          number: nfeDocuments.number,
          recipientName: nfeParticipants.legalName,
          recipientTaxId: nfeParticipants.taxId,
          returnReason: tripDocuments.returnReason,
          separationStatus: tripDocuments.separationStatus,
          series: nfeDocuments.series,
          stopId: tripDocuments.stopId,
          totalAmount: nfeDocuments.totalValue,
        })
        .from(tripDocuments)
        .leftJoin(
          nfeDocuments,
          and(
            eq(nfeDocuments.companyId, tripDocuments.companyId),
            eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
          ),
        )
        .leftJoin(
          nfeParticipants,
          and(
            eq(nfeParticipants.companyId, tripDocuments.companyId),
            eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
            eq(nfeParticipants.role, RECIPIENT_ROLE),
          ),
        )
        .where(
          and(
            eq(tripDocuments.companyId, input.companyId),
            inArray(tripDocuments.tripId, input.tripIds),
            isNull(tripDocuments.releasedAt),
          ),
        )
        /**
         * A ordem é a do vínculo, que é a ordem em que a carga foi separada — e ela precisa ser
         * estável: romaneio cuja lista embaralha entre uma abertura e outra é romaneio que o
         * conferente não consegue checar. Sem `order by` explícito, quem decide é o plano do banco.
         */
        .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id))
    )
  }
}

type StopRow = {
  readonly arrivedAt: Date | null
  readonly completedAt: Date | null
  readonly deliveryWindowEnd: Date | null
  readonly deliveryWindowStart: Date | null
  readonly id: string
  readonly label: string
  readonly latitude: string | null
  readonly longitude: string | null
  readonly sequence: bigint
  readonly tripId: string
}

type VolumeTotals = { readonly grossWeight: string; readonly quantity: string }

type DocumentRow = {
  readonly accessKey: string | null
  readonly deliveredAt: Date | null
  readonly hasDeliveryPhoto: boolean
  readonly id: string
  readonly number: string | null
  readonly recipientName: string | null
  readonly recipientTaxId: string | null
  readonly returnReason: string | null
  readonly separationStatus: string
  readonly series: string | null
  readonly stopId: string | null
  readonly totalAmount: string | null
  readonly volumes: VolumeTotals | null
}

function toDriverStop(
  stop: StopRow,
  documentsByStop: Map<string | null, DocumentRow[]>,
  schedulesByStop: Map<string, DriverStopSchedule>,
  proofSettings: ProofSettingsLookup,
): DriverTripStop {
  return {
    arrivedAt: stop.arrivedAt?.toISOString() ?? null,
    completedAt: stop.completedAt?.toISOString() ?? null,
    deliveryWindowEnd: stop.deliveryWindowEnd?.toISOString() ?? null,
    deliveryWindowStart: stop.deliveryWindowStart?.toISOString() ?? null,
    documents: (documentsByStop.get(stop.id) ?? []).map((row) =>
      toDriverDocument(row, proofSettings),
    ),
    id: stop.id,
    label: stop.label,
    latitude: stop.latitude,
    longitude: stop.longitude,
    schedule: schedulesByStop.get(stop.id) ?? null,
    sequence: Number(stop.sequence),
  }
}

/**
 * Toda ausência vira vazio, nunca `undefined`: a NF-e é dado de terceiro, e a tela do motorista não
 * pode quebrar porque o emitente não mandou o peso do volume.
 */
function toDriverDocument(
  row: DocumentRow,
  proofSettings: ProofSettingsLookup,
): DriverTripDocument {
  // Spec 082 (revisão): resolvido pelo CNPJ do destinatário DESTE documento — a mesma regra da
  // escrita do comprovante, via `resolveProofSettingsForRecipient`.
  const deliveryProof = resolveProofSettingsForRecipient({
    lookup: proofSettings,
    recipientTaxId: row.recipientTaxId ?? '',
  })

  return {
    accessKey: row.accessKey ?? '',
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    deliveryProof,
    grossWeight: row.volumes?.grossWeight ?? '0',
    id: row.id,
    number: row.number ?? '',
    /**
     * ADR-0070 §1, spec 159 RF1/RF2: entregue, foto obrigatória resolvida, e sem foto no último
     * evento `delivered`. Nunca bloqueia — só avisa que a foto ainda não chegou.
     */
    proofPending:
      row.deliveredAt !== null &&
      deliveryProof.photo === REQUIRED_PROOF_FIELD_MODE &&
      !row.hasDeliveryPhoto,
    recipientName: row.recipientName ?? '',
    returnReason: row.returnReason,
    separationStatus: row.separationStatus,
    series: row.series ?? '',
    totalAmount: row.totalAmount ?? '0',
    volumeCount: row.volumes?.quantity ?? '0',
  }
}

function groupBy<TRow, TKey>(rows: readonly TRow[], key: (row: TRow) => TKey): Map<TKey, TRow[]> {
  const grouped = new Map<TKey, TRow[]>()
  for (const row of rows) {
    const bucket = grouped.get(key(row)) ?? []
    bucket.push(row)
    grouped.set(key(row), bucket)
  }

  return grouped
}
