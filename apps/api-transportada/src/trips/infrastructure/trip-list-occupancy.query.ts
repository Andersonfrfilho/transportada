/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'

import { fleetVehicles } from '../../database/fleet.schema.js'
import { tripDocuments, trips } from '../../database/trip.schema.js'
import { vehicleVolumeReferences } from '../../database/vehicle-volume-reference.schema.js'
import { TRIP_LIST_ENRICHMENT_LOG } from '../application/trip-list-enrichment.constant.js'
import type { TripRouteFreezeLogger } from '../application/freeze-trip-route-gracefully.js'
import { buildTripListOccupancy } from '../domain/trip-list-occupancy.policy.js'
import type { TripListOccupancy } from '../domain/trip-list-occupancy.policy.js'
import { resolveTripCargoWeight, withPayloadCeiling } from '../domain/trip-cargo-weight.policy.js'
import {
  EMPTY_OCCUPANCY_CARGO_FACTS,
  hasKnownTripCapacity,
  loadOccupancyCargoFacts,
  OCCUPANCY_VEHICLE_COLUMNS,
  resolveOccupancyReferenceKey,
  resolveTripOccupancyFromFacts,
  type OccupancyCargoFacts,
  type OccupancyVehicleFacts,
  type TripOccupancyFacts,
} from './trip-occupancy.support.js'
import { loadDocumentCargoWeights } from './trip-cargo-weight.support.js'
import type { DocumentCargoWeight } from './trip-cargo-weight.support.js'
import type { TripQueryable } from './trip-queryable.type.js'

type TripListOccupancyInput = {
  readonly companyId: string
  readonly tripIds: readonly string[]
}

type ReferenceFacts = NonNullable<TripOccupancyFacts['reference']>

const NO_DOCUMENT_WEIGHT: DocumentCargoWeight = { grossWeightKilograms: null, source: null }

/** O que se leu do banco para uma viagem da página — a conta é feita depois, em memória. */
export type TripListOccupancyTripFacts = {
  readonly facts: Omit<TripOccupancyFacts, 'cargo'>
  readonly nfeDocumentIds: readonly string[]
  readonly tripId: string
  readonly vehicleId: string | null
}

export type TripListOccupancyFacts = {
  readonly cargo: OccupancyCargoFacts
  readonly trips: readonly TripListOccupancyTripFacts[]
  readonly weights: ReadonlyMap<string, DocumentCargoWeight>
}

/**
 * Spec 259: a ocupação de **várias** viagens numa só passada — o veículo, a carreta, a referência de
 * catálogo, os fatores, os volumes, as caixas medidas e o peso saem uma vez para a página inteira
 * (~10 consultas, qualquer que seja o tamanho dela), e a conta é a de `resolveTripOccupancyFromFacts`,
 * a mesma do detalhe. Viagem sem veículo é `null`; viagem de outra empresa nem entra no mapa.
 *
 * Falha na conta de uma viagem a deixa fora do mapa, com aviso só de ids: a lista de hoje nunca fica
 * pior por causa da ocupação. Falha na leitura propaga — quem decide o que fazer com a página é o chamador.
 */
export async function readTripListOccupancies(
  queryable: TripQueryable,
  input: TripListOccupancyInput & { readonly logger?: TripRouteFreezeLogger | undefined },
): Promise<ReadonlyMap<string, TripListOccupancy | null>> {
  const facts = await readTripListOccupancyFacts(queryable, input)

  return assembleTripListOccupancies({ companyId: input.companyId, facts, logger: input.logger })
}

/**
 * As notas são as de `trip_documents.nfe_document_id`, sem filtrar liberadas — o mesmo critério do
 * detalhe (`readTripDetail`), e é ele que faz os dois números baterem.
 */
export async function readTripListOccupancyFacts(
  queryable: TripQueryable,
  input: TripListOccupancyInput,
): Promise<TripListOccupancyFacts> {
  const empty: TripListOccupancyFacts = {
    cargo: EMPTY_OCCUPANCY_CARGO_FACTS,
    trips: [],
    weights: new Map(),
  }
  if (input.tripIds.length === 0) return empty

  const tripRows = await queryable
    .select({
      id: trips.id,
      trailerVehicleId: trips.trailerVehicleId,
      vehicleId: trips.vehicleId,
    })
    .from(trips)
    .where(and(eq(trips.companyId, input.companyId), inArray(trips.id, [...input.tripIds])))
  if (tripRows.length === 0) return empty

  const documentsByTrip = await readNfeDocumentIdsByTrip(queryable, {
    companyId: input.companyId,
    tripIds: tripRows.map((row) => row.id),
  })
  const vehicleById = await readVehicles(queryable, {
    companyId: input.companyId,
    vehicleIds: tripRows.flatMap((row) => [row.vehicleId, row.trailerVehicleId]),
  })
  const vehicles = tripRows.map((row) => ({
    trailer: row.trailerVehicleId === null ? undefined : vehicleById.get(row.trailerVehicleId),
    vehicle: row.vehicleId === null ? undefined : vehicleById.get(row.vehicleId),
  }))
  const referenceByKey = await readReferences(queryable, vehicles)
  const tripFacts = tripRows.map((row, index): TripListOccupancyTripFacts => {
    const { trailer, vehicle } = vehicles[index] ?? { trailer: undefined, vehicle: undefined }
    const reference =
      vehicle === undefined
        ? undefined
        : referenceByKey.get(
            buildReferenceMapKey(resolveOccupancyReferenceKey({ trailer, vehicle })),
          )

    return {
      facts: { reference, trailer, vehicle },
      nfeDocumentIds: documentsByTrip.get(row.id) ?? [],
      tripId: row.id,
      vehicleId: row.vehicleId,
    }
  })

  const capableDocumentIds = unique(
    tripFacts.flatMap((trip) => (hasKnownTripCapacity(trip.facts) ? trip.nfeDocumentIds : [])),
  )
  /** Sem nota em viagem de capacidade conhecida não há o que medir: a conta do detalhe também não lê. */
  const cargo =
    capableDocumentIds.length === 0
      ? EMPTY_OCCUPANCY_CARGO_FACTS
      : await loadOccupancyCargoFacts(queryable, {
          companyId: input.companyId,
          nfeDocumentIds: capableDocumentIds,
        })
  const weights = await loadDocumentCargoWeights(queryable, {
    companyId: input.companyId,
    nfeDocumentIds: unique(tripFacts.flatMap((trip) => trip.nfeDocumentIds)),
  })

  return { cargo, trips: tripFacts, weights }
}

/** A conta por viagem, pura: cada uma isolada das outras, para uma ficha corrompida não derrubar a página. */
export function assembleTripListOccupancies(input: {
  readonly companyId: string
  readonly facts: TripListOccupancyFacts
  readonly logger?: TripRouteFreezeLogger | undefined
}): ReadonlyMap<string, TripListOccupancy | null> {
  const occupancies = new Map<string, TripListOccupancy | null>()
  const { cargo, weights } = input.facts

  for (const trip of input.facts.trips) {
    if (trip.vehicleId === null) {
      occupancies.set(trip.tripId, null)
      continue
    }
    try {
      const result = resolveTripOccupancyFromFacts({
        facts: { ...trip.facts, cargo },
        nfeDocumentIds: trip.nfeDocumentIds,
        vehicleId: trip.vehicleId,
      })
      const cargoWeight = withPayloadCeiling({
        maxPayloadKg: result.maxPayloadKg,
        view: resolveTripCargoWeight({
          documents: trip.nfeDocumentIds.map(
            (documentId) => weights.get(documentId) ?? NO_DOCUMENT_WEIGHT,
          ),
        }),
      })

      occupancies.set(
        trip.tripId,
        buildTripListOccupancy({
          capacityUnknownReason: result.capacityUnknownReason,
          cargoWeight,
          volume: result.occupancy,
        }),
      )
    } catch (error) {
      input.logger?.warn(TRIP_LIST_ENRICHMENT_LOG.occupancyTripFailed, {
        companyId: input.companyId,
        errorName: error instanceof Error ? error.name : 'unknown',
        tripId: trip.tripId,
      })
    }
  }

  return occupancies
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

async function readNfeDocumentIdsByTrip(
  queryable: TripQueryable,
  input: TripListOccupancyInput,
): Promise<ReadonlyMap<string, readonly string[]>> {
  const rows = await queryable
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId, tripId: tripDocuments.tripId })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        inArray(tripDocuments.tripId, [...input.tripIds]),
        isNotNull(tripDocuments.nfeDocumentId),
      ),
    )
    .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id))

  const byTrip = new Map<string, string[]>()
  for (const row of rows) {
    if (row.nfeDocumentId === null) continue
    const bucket = byTrip.get(row.tripId)
    if (bucket === undefined) byTrip.set(row.tripId, [row.nfeDocumentId])
    else bucket.push(row.nfeDocumentId)
  }

  return byTrip
}

async function readVehicles(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly vehicleIds: readonly (string | null)[] },
): Promise<ReadonlyMap<string, OccupancyVehicleFacts>> {
  const vehicleIds = unique(input.vehicleIds.filter((id): id is string => id !== null))
  if (vehicleIds.length === 0) return new Map()

  const rows = await queryable
    .select(OCCUPANCY_VEHICLE_COLUMNS)
    .from(fleetVehicles)
    .where(
      and(eq(fleetVehicles.companyId, input.companyId), inArray(fleetVehicles.id, [...vehicleIds])),
    )

  return new Map(rows.map((row) => [row.id, row]))
}

function buildReferenceMapKey(key: {
  readonly bodyType: string
  readonly vehicleType: string
}): string {
  return `${key.vehicleType}|${key.bodyType}`
}

/** O catálogo de medidas por tipo e carroceria: uma consulta para os pares distintos da página. */
async function readReferences(
  queryable: TripQueryable,
  vehicles: readonly {
    readonly trailer: OccupancyVehicleFacts | undefined
    readonly vehicle: OccupancyVehicleFacts | undefined
  }[],
): Promise<ReadonlyMap<string, ReferenceFacts>> {
  const keys = vehicles.flatMap(({ trailer, vehicle }) =>
    vehicle === undefined ? [] : [resolveOccupancyReferenceKey({ trailer, vehicle })],
  )
  if (keys.length === 0) return new Map()

  const rows = await queryable
    .select({
      bodyType: vehicleVolumeReferences.bodyType,
      cargoHeightM: vehicleVolumeReferences.cargoHeightM,
      cargoLengthM: vehicleVolumeReferences.cargoLengthM,
      cargoWidthM: vehicleVolumeReferences.cargoWidthM,
      vehicleType: vehicleVolumeReferences.vehicleType,
    })
    .from(vehicleVolumeReferences)
    .where(
      and(
        inArray(vehicleVolumeReferences.vehicleType, unique(keys.map((key) => key.vehicleType))),
        inArray(vehicleVolumeReferences.bodyType, unique(keys.map((key) => key.bodyType))),
      ),
    )

  return new Map(
    rows.map((row) => [
      buildReferenceMapKey(row),
      {
        cargoHeightM: row.cargoHeightM,
        cargoLengthM: row.cargoLengthM,
        cargoWidthM: row.cargoWidthM,
      },
    ]),
  )
}
