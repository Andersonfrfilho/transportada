/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 258 T3.3: as opções dos filtros do relatório saem da mesma junção e das mesmas condições de viagem
 * da lista (empresa, viagem não cancelada, nota não liberada), sem filtro de nota — senão escolher uma
 * opção esconderia as outras.
 */
import { and, asc, isNotNull, type SQL } from 'drizzle-orm'

import { TRIP_REPORT_FACET_LIMIT } from '../domain/trip-report.constant.js'
import type {
  ListTripReportFacetsParams,
  TripReportFacetFilters,
  TripReportFacetEmitter,
  TripReportFacetPlaceKind,
  TripReportFacetSide,
} from '../domain/trip-report.types.js'
import type { TripDatabase } from './trip-queryable.type.js'
import { reportEmitter } from './trip-report-aliases.js'
import { buildTripReportBase, buildTripReportConditions } from './trip-report.query.js'

const FACET_FILTER_KEYS = [
  'contractorIdIn',
  'createdFrom',
  'createdUntil',
  'documentStatusIn',
  'driverIdIn',
  'proofPendingEq',
  'statusIn',
  'tripIdIn',
  'vehicleIdIn',
] as const satisfies readonly (keyof TripReportFacetFilters)[]

export async function selectFacetPlaces(
  database: TripDatabase,
  params: ListTripReportFacetsParams & {
    readonly kind: TripReportFacetPlaceKind
    readonly side: TripReportFacetSide
  },
): Promise<readonly string[]> {
  const { address, emitterAddress, query } = buildTripReportBase(
    database,
    (recipientAddress, senderAddress) => ({
      value: pickPlaceColumn(params, recipientAddress, senderAddress),
    }),
    { isDistinct: true },
  )
  const column = pickPlaceColumn(params, address, emitterAddress)
  const rows = await query
    .where(and(...buildScopeConditions(params, address, emitterAddress), isNotNull(column)))
    .orderBy(asc(column))
    .limit(TRIP_REPORT_FACET_LIMIT)
  return rows.map((row) => String(row['value']))
}

export async function selectFacetEmitters(
  database: TripDatabase,
  params: ListTripReportFacetsParams,
): Promise<readonly TripReportFacetEmitter[]> {
  const { address, emitterAddress, query } = buildTripReportBase(
    database,
    () => ({ name: reportEmitter.legalName, taxId: reportEmitter.taxId }),
    { isDistinct: true },
  )
  const rows = await query
    .where(
      and(
        ...buildScopeConditions(params, address, emitterAddress),
        isNotNull(reportEmitter.legalName),
        isNotNull(reportEmitter.taxId),
      ),
    )
    .orderBy(asc(reportEmitter.legalName), asc(reportEmitter.taxId))
    .limit(TRIP_REPORT_FACET_LIMIT)
  return rows.map((row) => ({ name: String(row['name']), taxId: String(row['taxId']) }))
}

type Address = Parameters<Parameters<typeof buildTripReportBase>[1]>[0]

function pickPlaceColumn(
  params: { readonly kind: TripReportFacetPlaceKind; readonly side: TripReportFacetSide },
  recipientAddress: Address,
  emitterAddress: Address,
) {
  const address = params.side === 'emitter' ? emitterAddress : recipientAddress
  return params.kind === 'city' ? address.city : address.state
}

function buildScopeConditions(
  params: ListTripReportFacetsParams,
  address: Address,
  emitterAddress: Address,
): readonly SQL[] {
  return buildTripReportConditions({
    address,
    companyId: params.companyId,
    cursor: undefined,
    emitterAddress,
    filters: pickFacetFilters(params.filters),
  })
}

/** O tipo já exclui filtro de nota, mas só o recorte em tempo de execução garante que ele nunca encolha as opções. */
function pickFacetFilters(filters: TripReportFacetFilters): TripReportFacetFilters {
  const record: Readonly<Record<string, unknown>> = filters
  return Object.fromEntries(
    FACET_FILTER_KEYS.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]),
  ) as TripReportFacetFilters
}
