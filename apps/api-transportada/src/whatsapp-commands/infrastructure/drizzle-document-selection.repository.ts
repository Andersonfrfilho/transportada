/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 — de que notas a seleção pelo WhatsApp é feita (D4). Isto só **escolhe ids**; quem
 * diz para que documento cada nota vai continua sendo a listagem (`describeDocumentOutputs`), para
 * o bot e a tela nunca discordarem da mesma nota.
 *
 * Todo filtro começa pela empresa do contexto, e toda subconsulta repete a empresa — por parâmetro
 * ou correlacionada à nota —, o que o contrato de tenant confere por texto de SQL.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm'

import { cteBatchItemDocuments, cteBatches } from '../../database/cte-batch.schema.js'
import { fleetVehicles } from '../../database/database.schema.js'
import { nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import { nfseEmissionProfiles, nfseServiceInvoiceDocuments } from '../../database/nfse.schema.js'
import { tripDocuments, trips } from '../../database/trip.schema.js'
import type {
  DocumentSelectionCriterion,
  DocumentSelectionRepositoryPort,
  DocumentSelectionResult,
  SelectableEmitter,
  SelectableTrip,
} from '../application/document-selection.port.js'
import { toIssueDateWindow } from '../domain/document-selection.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const EMITTER_ROLE = 'emitter'
const AUTHORIZED_STATUS = 'authorized'
const CANCELLED_STATUS = 'cancelled'
const RECENT_TRIP_LIMIT = 50
const UNNAMED_EMITTER = 'Emitente sem nome'

/** `number` é texto no banco: só o que é dígito puro vira inteiro, o resto fica fora da faixa. */
const NUMERIC_DOCUMENT_NUMBER = sql`(case when ${nfeDocuments.number} ~ '^[0-9]{1,18}$' then ${nfeDocuments.number}::bigint end)`

/**
 * "Nota pendente de documento": autorizada e sem vínculo ativo — o mesmo recorte de lote não
 * cancelado e de NFS-e sem `cancelled_at` que a listagem usa para os bloqueios de vínculo.
 */
export function buildPendingDocumentFilters(companyId: string): readonly SQL[] {
  return [
    eq(nfeDocuments.companyId, companyId),
    eq(nfeDocuments.status, AUTHORIZED_STATUS),
    sql`not exists (select 1 from ${cteBatchItemDocuments} inner join ${cteBatches} on ${cteBatches.companyId} = ${cteBatchItemDocuments.companyId} and ${cteBatches.id} = ${cteBatchItemDocuments.batchId} where ${cteBatchItemDocuments.companyId} = ${nfeDocuments.companyId} and ${cteBatchItemDocuments.nfeDocumentId} = ${nfeDocuments.id} and ${cteBatches.status} <> ${CANCELLED_STATUS})`,
    sql`not exists (select 1 from ${nfseServiceInvoiceDocuments} where ${nfseServiceInvoiceDocuments.companyId} = ${nfeDocuments.companyId} and ${nfseServiceInvoiceDocuments.nfeDocumentId} = ${nfeDocuments.id} and ${nfseServiceInvoiceDocuments.cancelledAt} is null)`,
  ]
}

export function buildEmitterParticipantFilters(companyId: string): readonly SQL[] {
  return [
    eq(nfeParticipants.companyId, companyId),
    eq(nfeParticipants.role, EMITTER_ROLE),
    isNotNull(nfeParticipants.taxId),
  ]
}

function buildEmitterFilter(input: {
  readonly companyId: string
  readonly emitterTaxId: string
}): SQL {
  return sql`exists (select 1 from ${nfeParticipants} where ${nfeParticipants.companyId} = ${input.companyId} and ${nfeParticipants.documentId} = ${nfeDocuments.id} and ${nfeParticipants.role} = ${EMITTER_ROLE} and ${nfeParticipants.taxId} = ${input.emitterTaxId})`
}

/**
 * Faixa, data e viagem trazem **todas** as notas do critério — a já vinculada aparece como
 * bloqueada, para o número bater com a tela. O remetente traz só as pendentes: sem janela nenhuma,
 * ele traria o histórico inteiro do emitente.
 */
export function buildSelectionCriterionFilters(input: {
  readonly companyId: string
  readonly criterion: DocumentSelectionCriterion
}): readonly SQL[] {
  const { companyId, criterion } = input
  const tenant = eq(nfeDocuments.companyId, companyId)
  switch (criterion.kind) {
    case 'number_range':
      return [
        tenant,
        buildEmitterFilter({ companyId, emitterTaxId: criterion.emitterTaxId }),
        eq(nfeDocuments.series, criterion.series),
        sql`${NUMERIC_DOCUMENT_NUMBER} between ${criterion.firstNumber} and ${criterion.lastNumber}`,
      ]
    case 'trip':
      return [
        tenant,
        sql`exists (select 1 from ${tripDocuments} where ${tripDocuments.companyId} = ${companyId} and ${tripDocuments.tripId} = ${criterion.tripId} and ${tripDocuments.nfeDocumentId} = ${nfeDocuments.id} and ${tripDocuments.releasedAt} is null)`,
      ]
    case 'issue_date': {
      const window = toIssueDateWindow(criterion)
      return [
        tenant,
        gte(nfeDocuments.issuedAt, window.from),
        lt(nfeDocuments.issuedAt, window.until),
        buildEmitterFilter({ companyId, emitterTaxId: criterion.emitterTaxId }),
      ]
    }
    case 'sender':
      return [
        ...buildPendingDocumentFilters(companyId),
        buildEmitterFilter({ companyId, emitterTaxId: criterion.emitterTaxId }),
      ]
  }
}

export function buildRecentTripFilters(input: {
  readonly companyId: string
  readonly since: Date
}): readonly SQL[] {
  return [
    eq(trips.companyId, input.companyId),
    ne(trips.status, CANCELLED_STATUS),
    gte(trips.createdAt, input.since),
  ]
}

export function buildNfseProfileVersionFilters(input: {
  readonly companyId: string
  readonly profileIds: readonly string[]
}): readonly SQL[] {
  return [
    eq(nfseEmissionProfiles.companyId, input.companyId),
    inArray(nfseEmissionProfiles.id, [...input.profileIds]),
  ]
}

export class DrizzleDocumentSelectionRepository implements DocumentSelectionRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async listPendingEmitters(input: {
    readonly companyId: string
  }): Promise<readonly SelectableEmitter[]> {
    return this.listEmitters(input.companyId, buildPendingDocumentFilters(input.companyId))
  }

  public async listIssueDateEmitters(input: {
    readonly companyId: string
    readonly endDate: string
    readonly startDate: string
  }): Promise<readonly SelectableEmitter[]> {
    const window = toIssueDateWindow(input)
    return this.listEmitters(input.companyId, [
      eq(nfeDocuments.companyId, input.companyId),
      gte(nfeDocuments.issuedAt, window.from),
      lt(nfeDocuments.issuedAt, window.until),
    ])
  }

  public async listPendingSeries(input: {
    readonly companyId: string
    readonly emitterTaxId: string
  }): Promise<readonly string[]> {
    const rows = await this.database
      .selectDistinct({ series: nfeDocuments.series })
      .from(nfeDocuments)
      .where(and(...buildPendingDocumentFilters(input.companyId), buildEmitterFilter(input)))
      .orderBy(asc(nfeDocuments.series))
    return rows.map((row) => row.series)
  }

  public async listRecentTrips(input: {
    readonly companyId: string
    readonly since: Date
  }): Promise<readonly SelectableTrip[]> {
    const documentCount = sql<number>`count(${tripDocuments.id})::int`
    const rows = await this.database
      .select({
        createdAt: trips.createdAt,
        documentCount,
        id: trips.id,
        vehiclePlate: fleetVehicles.plate,
      })
      .from(trips)
      .innerJoin(
        fleetVehicles,
        and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
      )
      .leftJoin(
        tripDocuments,
        and(
          eq(tripDocuments.companyId, trips.companyId),
          eq(tripDocuments.tripId, trips.id),
          isNull(tripDocuments.releasedAt),
          isNotNull(tripDocuments.nfeDocumentId),
        ),
      )
      .where(and(...buildRecentTripFilters(input)))
      .groupBy(trips.id, trips.createdAt, fleetVehicles.plate)
      .having(sql`count(${tripDocuments.id}) > 0`)
      .orderBy(desc(trips.createdAt))
      .limit(RECENT_TRIP_LIMIT)
    return rows
  }

  /** Conta antes de trazer: acima do teto a resposta é o número achado, não mil ids truncados. */
  public async resolveSelection(input: {
    readonly companyId: string
    readonly criterion: DocumentSelectionCriterion
    readonly limit: number
  }): Promise<DocumentSelectionResult> {
    const [counted] = await this.database
      .select({ total: sql<number>`count(*)::int` })
      .from(nfeDocuments)
      .where(and(...buildSelectionCriterionFilters(input)))
    const total = counted?.total ?? 0
    if (total === 0 || total > input.limit) return { documentIds: [], total }

    const rows = await this.database
      .select({ id: nfeDocuments.id })
      .from(nfeDocuments)
      .where(and(...buildSelectionCriterionFilters(input)))
      .orderBy(asc(nfeDocuments.issuedAt), asc(nfeDocuments.id))
    return { documentIds: rows.map((row) => row.id), total }
  }

  public async findNfseProfileVersions(input: {
    readonly companyId: string
    readonly profileIds: readonly string[]
  }): Promise<ReadonlyMap<string, string>> {
    if (input.profileIds.length === 0) return new Map()
    const rows = await this.database
      .select({ id: nfseEmissionProfiles.id, version: nfseEmissionProfiles.version })
      .from(nfseEmissionProfiles)
      .where(and(...buildNfseProfileVersionFilters(input)))
    return new Map(rows.map((row) => [row.id, row.version.toString()]))
  }

  private async listEmitters(
    companyId: string,
    documentFilters: readonly SQL[],
  ): Promise<readonly SelectableEmitter[]> {
    const rows = await this.database
      .selectDistinctOn([nfeParticipants.taxId], {
        name: nfeParticipants.legalName,
        taxId: nfeParticipants.taxId,
      })
      .from(nfeParticipants)
      .innerJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.companyId, nfeParticipants.companyId),
          eq(nfeDocuments.id, nfeParticipants.documentId),
        ),
      )
      .where(and(...buildEmitterParticipantFilters(companyId), ...documentFilters))
      .orderBy(nfeParticipants.taxId)
    return rows
      .flatMap((row) =>
        row.taxId === null ? [] : [{ name: row.name ?? UNNAMED_EMITTER, taxId: row.taxId }],
      )
      .toSorted((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
  }
}
