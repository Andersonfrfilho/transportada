/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray } from 'drizzle-orm'

import { fleetDrivers } from '../../database/fleet.schema.js'
import type { TripCargoPreviewContext } from '../application/preview-trip-cargo.use-case.js'
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
  const [cargo, cargoWeight, addresses, numbers, securesCargo] = await Promise.all([
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
    everyDriverSecuresCargo(queryable, {
      companyId: input.companyId,
      driverIds: input.driverIds,
    }),
  ])

  return {
    bedDimensions: cargo.bedDimensions,
    boxesByDocument: cargo.boxesByDocument,
    capacityM3: cargo.capacityM3,
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
 * Se **todos** os motoristas escolhidos amarram a carga.
 *
 * ⚠️ **O pior caso manda**, como no peso e na cubagem: basta um não amarrar para a planta desenhar a
 * pilha limitada. E lista vazia é `false` — no diálogo de montagem o desenho aparece antes de o
 * motorista ser escolhido, e ausência nunca vira permissão.
 */
async function everyDriverSecuresCargo(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly driverIds: readonly string[] },
): Promise<boolean> {
  if (input.driverIds.length === 0) return false

  const rows = await queryable
    .select({ securesCargo: fleetDrivers.securesCargo })
    .from(fleetDrivers)
    .where(
      and(
        eq(fleetDrivers.companyId, input.companyId),
        inArray(fleetDrivers.id, [...input.driverIds]),
      ),
    )

  return rows.length === input.driverIds.length && rows.every((row) => row.securesCargo)
}
