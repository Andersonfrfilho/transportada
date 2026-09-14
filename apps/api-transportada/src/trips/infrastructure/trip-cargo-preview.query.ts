/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray } from 'drizzle-orm'

import { fleetDrivers } from '../../database/fleet.schema.js'
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
  const [cargo, cargoWeight, addresses, numbers, driversSecureCargo] = await Promise.all([
    loadTripOccupancy(queryable, input),
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
