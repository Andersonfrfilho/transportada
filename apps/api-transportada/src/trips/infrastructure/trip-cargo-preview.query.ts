/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripCargoPreviewContext } from '../application/preview-trip-cargo.use-case.js'
import { buildStopAddressKey } from '../domain/stop-address-key.js'
import { listStopAddresses } from './nfe-destination-address.support.js'
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
    readonly nfeDocumentIds: readonly string[]
    readonly vehicleId: string
  },
): Promise<TripCargoPreviewContext> {
  const [cargo, cargoWeight, addresses] = await Promise.all([
    loadTripOccupancy(queryable, input),
    loadTripCargoWeight(queryable, {
      companyId: input.companyId,
      nfeDocumentIds: input.nfeDocumentIds,
    }),
    listStopAddresses(queryable, {
      companyId: input.companyId,
      nfeDocumentIds: input.nfeDocumentIds,
    }),
  ])

  return {
    bedDimensions: cargo.bedDimensions,
    boxesByDocument: cargo.boxesByDocument,
    capacityM3: cargo.capacityM3,
    loadingAccess: cargo.loadingAccess,
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
        label: address?.label ?? nfeDocumentId,
        nfeDocumentId,
        volumeM3: cargo.volumeByDocument.get(nfeDocumentId) ?? null,
        weightKilograms: cargoWeight.weightByDocument.get(nfeDocumentId) ?? null,
      }
    }),
    occupancy: cargo.occupancy,
  }
}
