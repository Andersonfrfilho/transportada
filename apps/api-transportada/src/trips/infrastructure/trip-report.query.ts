/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 253 RF1/RF2: a junção do relatório e todos os filtros, no SQL. Cada degrau carrega o
 * `company_id` — uma junção por id solto é o caminho pelo qual a nota de uma empresa aparece no
 * relatório de outra (contrato de fonte em `test/trip-report/query-tenant-safety.contract.ts`).
 */
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import type { SelectedFields } from 'drizzle-orm/pg-core'

import { contractors } from '../../database/delivery-client.schema.js'
import { freightCalculations } from '../../database/freight.schema.js'
import { nfeAddresses } from '../../database/nfe.schema.js'
import { tripDocuments, trips } from '../../database/trip.schema.js'
import type { TripFilters } from '../application/trip.port.js'
import type { TripReportValueOperator } from '../domain/trip-report.constant.js'
import type { TripReportCursor, TripReportFilters } from '../domain/trip-report.types.js'
import type { TripDatabase } from './trip-queryable.type.js'
import { reportDocument, reportEmitter, reportRecipient } from './trip-report-aliases.js'
import { buildDocumentFilterConditions, escapeLike } from './trip-report-document-filters.query.js'
import { buildTripListFilters } from './trip.query.js'

export { reportDocument, reportEmitter, reportRecipient }

const VALUE_OPERATOR_SQL: Readonly<Record<TripReportValueOperator, string>> = {
  eq: '=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  neq: '<>',
}

/** A nota chega por `trip_documents.nfe_document_id` ou, na falta dele, pelo cálculo de frete. */
export const resolvedDocumentId = sql<string>`coalesce(${tripDocuments.nfeDocumentId}, ${freightCalculations.nfeDocumentId})`

const ADDRESS_COLUMNS = {
  city: nfeAddresses.city,
  district: nfeAddresses.district,
  number: nfeAddresses.number,
  state: nfeAddresses.state,
  street: nfeAddresses.street,
}

/** `nfe_addresses` não é único por participante: o endereço de cada parte é a primeira linha. */
function buildParticipantAddress(
  database: TripDatabase,
  participant: typeof reportRecipient | typeof reportEmitter,
  name: string,
) {
  return database
    .select(ADDRESS_COLUMNS)
    .from(nfeAddresses)
    .where(
      and(
        eq(nfeAddresses.companyId, participant.companyId),
        eq(nfeAddresses.participantId, participant.id),
      ),
    )
    .orderBy(asc(nfeAddresses.createdAt), asc(nfeAddresses.id))
    .limit(1)
    .as(name)
}

export type TripReportAddress = ReturnType<typeof buildParticipantAddress>

export function buildTripReportBase(
  database: TripDatabase,
  selection: (address: TripReportAddress, emitterAddress: TripReportAddress) => SelectedFields,
  options: { readonly isDistinct?: boolean } = {},
) {
  const address = buildParticipantAddress(
    database,
    reportRecipient,
    'trip_report_recipient_address',
  )
  const emitterAddress = buildParticipantAddress(
    database,
    reportEmitter,
    'trip_report_emitter_address',
  )
  return {
    address,
    emitterAddress,
    query: (options.isDistinct === true
      ? database.selectDistinct(selection(address, emitterAddress))
      : database.select(selection(address, emitterAddress))
    )
      .from(tripDocuments)
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
      )
      .leftJoin(
        freightCalculations,
        and(
          eq(freightCalculations.companyId, tripDocuments.companyId),
          eq(freightCalculations.id, tripDocuments.freightCalculationId),
        ),
      )
      .innerJoin(
        reportDocument,
        and(
          eq(reportDocument.companyId, tripDocuments.companyId),
          eq(reportDocument.id, resolvedDocumentId),
        ),
      )
      .leftJoin(
        reportEmitter,
        and(
          eq(reportEmitter.companyId, reportDocument.companyId),
          eq(reportEmitter.documentId, reportDocument.id),
          eq(reportEmitter.role, 'emitter'),
        ),
      )
      .leftJoin(
        reportRecipient,
        and(
          eq(reportRecipient.companyId, reportDocument.companyId),
          eq(reportRecipient.documentId, reportDocument.id),
          eq(reportRecipient.role, 'recipient'),
        ),
      )
      .leftJoin(
        contractors,
        and(
          eq(contractors.companyId, reportEmitter.companyId),
          eq(contractors.taxId, reportEmitter.taxId),
        ),
      )
      .leftJoinLateral(address, sql`true`)
      .leftJoinLateral(emitterAddress, sql`true`),
  }
}

export const REPORT_ORDER = [desc(trips.createdAt), desc(trips.id), desc(tripDocuments.id)] as const

function pickTripLevelFilters(filters: TripReportFilters): TripFilters {
  return {
    ...(filters.statusIn === undefined ? {} : { statusIn: filters.statusIn }),
    ...(filters.vehicleIdIn === undefined ? {} : { vehicleIdIn: filters.vehicleIdIn }),
    ...(filters.driverIdIn === undefined ? {} : { driverIdIn: filters.driverIdIn }),
    ...(filters.createdFrom === undefined ? {} : { createdFrom: filters.createdFrom }),
    ...(filters.createdUntil === undefined ? {} : { createdUntil: filters.createdUntil }),
    ...(filters.proofPendingEq === undefined ? {} : { proofPendingEq: filters.proofPendingEq }),
  }
}

function buildContractorCondition(
  contractorFilter: NonNullable<TripReportFilters['contractorIdIn']>,
): SQL | undefined {
  const alternatives: SQL[] = []
  if (contractorFilter.contractorIds.length > 0) {
    alternatives.push(inArray(contractors.id, [...contractorFilter.contractorIds]))
  }
  if (contractorFilter.includesNone) alternatives.push(isNull(contractors.id))
  return or(...alternatives)
}

function buildCursorCondition(cursor: TripReportCursor): SQL {
  return sql`(${trips.createdAt}, ${trips.id}, ${tripDocuments.id}) < (${cursor.createdAt}::timestamptz, ${cursor.tripId}::uuid, ${cursor.tripDocumentId}::uuid)`
}

export function buildTripReportConditions(input: {
  readonly address: TripReportAddress
  readonly companyId: string
  readonly cursor: TripReportCursor | undefined
  readonly emitterAddress: TripReportAddress
  readonly filters: TripReportFilters
}): readonly SQL[] {
  const { address, companyId, cursor, emitterAddress, filters } = input
  const conditions: (SQL | undefined)[] = [
    ...buildTripListFilters({ companyId, cursor: null, filters: pickTripLevelFilters(filters) }),
    eq(tripDocuments.companyId, companyId),
    isNull(tripDocuments.releasedAt),
    ne(trips.status, 'cancelled'),
  ]
  if (cursor !== undefined) conditions.push(buildCursorCondition(cursor))
  if (filters.documentStatusIn !== undefined) {
    conditions.push(inArray(tripDocuments.separationStatus, [...filters.documentStatusIn]))
  }
  if (filters.tripIdIn !== undefined) conditions.push(inArray(trips.id, [...filters.tripIdIn]))
  if (filters.documentIdIn !== undefined) {
    conditions.push(inArray(reportDocument.id, [...filters.documentIdIn]))
  }
  if (filters.search !== undefined) {
    const pattern = `%${escapeLike(filters.search)}%`
    conditions.push(
      or(
        ilike(reportDocument.number, pattern),
        ilike(reportDocument.series, pattern),
        ilike(reportDocument.accessKey, pattern),
      ),
    )
  }
  if (filters.contractorIdIn !== undefined) {
    conditions.push(buildContractorCondition(filters.contractorIdIn))
  }
  if (filters.recipientCityIn !== undefined) {
    conditions.push(inArray(address.city, [...filters.recipientCityIn]))
  }
  if (filters.recipientStateIn !== undefined) {
    conditions.push(inArray(address.state, [...filters.recipientStateIn]))
  }
  if (filters.valueOperator !== undefined && filters.valueAmount !== undefined) {
    const operator = sql.raw(VALUE_OPERATOR_SQL[filters.valueOperator])
    conditions.push(
      sql`${reportDocument.totalValue}::numeric ${operator} ${filters.valueAmount}::numeric`,
    )
  }
  conditions.push(
    ...buildDocumentFilterConditions({
      companyId,
      emitterAddress,
      filters,
      recipientAddress: address,
    }),
  )
  return conditions.filter((condition): condition is SQL => condition !== undefined)
}
