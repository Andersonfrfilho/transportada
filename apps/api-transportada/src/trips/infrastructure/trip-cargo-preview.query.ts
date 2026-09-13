/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, notInArray } from 'drizzle-orm'

import { fleetDrivers, fleetVehicles } from '../../database/fleet.schema.js'
import { TRIP_TERMINAL_STATUSES, trips } from '../../database/trip.schema.js'
import { TRACTOR_UNIT_VEHICLE_TYPE } from '../../shared/vehicle-type.constant.js'
import type { TripCargoPreviewContext } from '../application/preview-trip-cargo.use-case.js'
import { resolveCargoSecuring } from '../domain/cargo-securing.policy.js'
import { buildStopAddressKey } from '../domain/stop-address-key.js'
import { listDocumentNumbers, listStopAddresses } from './nfe-destination-address.support.js'
import { withPayloadCeiling } from '../domain/trip-cargo-weight.policy.js'
import { loadTripCargoWeight } from './trip-cargo-weight.support.js'
import { loadTripOccupancy } from './trip-occupancy.support.js'
import type { TripQueryable } from './trip-queryable.type.js'

/**
 * O contexto da prévia de carga, montado dos **mesmos suportes** que o detalhe da viagem usa:
 * `loadTripOccupancy` já recebe `{companyId, nfeDocumentIds, vehicleId}` e nunca precisou de
 * viagem, e `listStopAddresses` já resolve o destino físico em lote.
 *
 * ⚠️ A chave da parada é `buildStopAddressKey` — a mesma de `reconcileStopOnLink`. Se esta consulta
 * agrupasse por outro critério, a prévia desenharia um baú e o aceite criaria outro.
 */
export async function readCargoPreviewContext(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly driverIds: readonly string[]
    readonly nfeDocumentIds: readonly string[]
    readonly vehicleId: string
  },
): Promise<TripCargoPreviewContext> {
  /**
   * T18 (revisão, MENOR 12): a prévia acontece antes de a viagem existir, mas se o cavalo tem
   * carreta padrão livre e ativa, é ela que a viagem vai nascer com (`resolveDefaultTrailerForCreation`,
   * `trip.use-case.ts`) — mostrar "sem carreta" aqui e "carreta X" um clique depois confundia mais
   * do que ajudava. A mesma regra, reescrita em consulta porque a prévia não tem acesso ao
   * `TripRepositoryPort` (só a `queryable`).
   */
  const defaultTrailerVehicleId = await resolveDefaultTrailerForPreview(queryable, input)

  const [cargo, cargoWeight, addresses, numbers, driversSecureCargo] = await Promise.all([
    loadTripOccupancy(queryable, { ...input, trailerVehicleId: defaultTrailerVehicleId }),
    loadTripCargoWeight(queryable, {
      companyId: input.companyId,
      nfeDocumentIds: input.nfeDocumentIds,
    }),
    listStopAddresses(queryable, {
      companyId: input.companyId,
      nfeDocumentIds: input.nfeDocumentIds,
    }),
    listDocumentNumbers(queryable, {
      companyId: input.companyId,
      nfeDocumentIds: input.nfeDocumentIds,
    }),
    readDriversSecureCargo(queryable, {
      companyId: input.companyId,
      driverIds: input.driverIds,
    }),
  ])
  const { enclosedBody, securesCargo } = resolveCargoSecuring({
    bodyType: cargo.bodyType,
    driversSecureCargo,
  })

  return {
    bedDimensions: cargo.bedDimensions,
    boxesByDocument: cargo.boxesByDocument,
    capacityUnknownReason: cargo.capacityUnknownReason,
    capacityUnknownVehicleId: cargo.capacityUnknownVehicleId,
    capacityM3: cargo.capacityM3,
    enclosedBody,
    fallbackBoxVolumeM3: cargo.fallbackBoxVolumeM3,
    measuredShapes: cargo.measuredShapes,
    loadingAccess: cargo.loadingAccess,
    securesCargo,
    /**
     * ⚠️ O teto entra **depois** das duas leituras, nunca encadeando uma na outra: o peso e o
     * veículo são consultados em paralelo, e serializá-los custaria uma ida ao banco por nada.
     */
    cargoWeight: withPayloadCeiling({ maxPayloadKg: cargo.maxPayloadKg, view: cargoWeight.view }),
    documents: input.nfeDocumentIds.map((nfeDocumentId) => {
      const address = addresses.get(nfeDocumentId)
      return {
        addressKey: address === undefined ? null : buildStopAddressKey(address.components),
        /** Nota cujo endereço não resolve ainda precisa de nome: some do desenho sem ele. */
        clientName: address?.recipientName ?? '',
        label: address?.label ?? nfeDocumentId,
        nfeDocumentId,
        number: numbers.get(nfeDocumentId) ?? '',
        volumeM3: cargo.volumeByDocument.get(nfeDocumentId) ?? null,
        weightKilograms: cargoWeight.weightByDocument.get(nfeDocumentId) ?? null,
      }
    }),
    occupancy: cargo.occupancy,
  }
}

/**
 * T18 (revisão, MENOR 12): espelha `resolveDefaultTrailerForCreation` (`trip.use-case.ts`) — só usa
 * a padrão quando ela ainda existe nesta empresa, é uma carreta ativa, e não está numa viagem
 * aberta. Mesma regra, caminho diferente: a criação já tem o `vehicle` (`TripVehicleCandidate`) em
 * mãos e o repositório para checar a carreta; a prévia só tem `queryable` e ainda não tem viagem.
 */
async function resolveDefaultTrailerForPreview(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly vehicleId: string },
): Promise<string | null> {
  const [vehicle] = await queryable
    .select({
      defaultTrailerVehicleId: fleetVehicles.defaultTrailerVehicleId,
      vehicleType: fleetVehicles.vehicleType,
    })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.companyId, input.companyId), eq(fleetVehicles.id, input.vehicleId)))
    .limit(1)
  const defaultTrailerVehicleId = vehicle?.defaultTrailerVehicleId ?? null
  if (defaultTrailerVehicleId === null || vehicle?.vehicleType !== TRACTOR_UNIT_VEHICLE_TYPE) {
    return null
  }

  const [trailer] = await queryable
    .select({ role: fleetVehicles.role, status: fleetVehicles.status })
    .from(fleetVehicles)
    .where(
      and(
        eq(fleetVehicles.companyId, input.companyId),
        eq(fleetVehicles.id, defaultTrailerVehicleId),
      ),
    )
    .limit(1)
  if (trailer === undefined || trailer.role !== 'trailer' || trailer.status !== 'active') {
    return null
  }

  const [openTrip] = await queryable
    .select({ id: trips.id })
    .from(trips)
    .where(
      and(
        eq(trips.companyId, input.companyId),
        eq(trips.trailerVehicleId, defaultTrailerVehicleId),
        notInArray(trips.status, [...TRIP_TERMINAL_STATUSES]),
      ),
    )
    .limit(1)
  return openTrip === undefined ? defaultTrailerVehicleId : null
}

/**
 * Se cada motorista escolhido amarra a carga, na ordem de `driverIds`. Ficha que não existe na
 * empresa entra como `false` — ausência nunca vira permissão; quem decide é `resolveCargoSecuring`.
 */
async function readDriversSecureCargo(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly driverIds: readonly string[] },
): Promise<readonly boolean[]> {
  if (input.driverIds.length === 0) return []

  const rows = await queryable
    .select({ id: fleetDrivers.id, securesCargo: fleetDrivers.securesCargo })
    .from(fleetDrivers)
    .where(
      and(
        eq(fleetDrivers.companyId, input.companyId),
        inArray(fleetDrivers.id, [...input.driverIds]),
      ),
    )
  const securesCargoById = new Map(rows.map((row) => [row.id, row.securesCargo]))

  return input.driverIds.map((driverId) => securesCargoById.get(driverId) === true)
}
