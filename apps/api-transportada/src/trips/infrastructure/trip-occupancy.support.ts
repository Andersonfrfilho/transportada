/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'

import { companyCargoVolumeFactors } from '../../database/company-cargo-volume-factor.schema.js'
import { fleetVehicles } from '../../database/fleet.schema.js'
import { nfeVolumes } from '../../database/nfe.schema.js'
import { vehicleVolumeReferences } from '../../database/vehicle-volume-reference.schema.js'
import { resolveCargoVolume } from '../../nfe-documents/domain/cargo-volume.policy.js'
import { resolveVehicleCapacity } from '../../fleet/domain/vehicle-capacity.policy.js'
import type { TripOccupancyView } from '../application/trip.port.js'
import { resolveTripOccupancy } from '../domain/trip-occupancy.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

/**
 * Spec 075: a ocupação do baú, montada em **três consultas** — o veículo, os fatores da empresa e
 * os volumes das notas. Nunca uma consulta por nota: o detalhe da viagem já é a tela mais pesada do
 * módulo, e o N+1 aqui multiplicaria por vinte (`code-standart.md` §15).
 *
 * ⚠️ A capacidade sai do veículo **que carrega**. Hoje a viagem tem um veículo só e ele é o de
 * tração; quando o implemento entrar, a chave da referência passa a ser a dele (D2b), e é
 * `resolveVolumeReferenceKey` que decide — não este arquivo.
 */
export async function loadTripOccupancy(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
    readonly vehicleId: string
  },
): Promise<TripOccupancyView | null> {
  const [vehicle] = await queryable
    .select({
      bodyType: fleetVehicles.bodyType,
      capacityM3: fleetVehicles.capacityM3,
      cargoHeightM: fleetVehicles.cargoHeightM,
      cargoLengthM: fleetVehicles.cargoLengthM,
      cargoWidthM: fleetVehicles.cargoWidthM,
      vehicleType: fleetVehicles.vehicleType,
    })
    .from(fleetVehicles)
    .where(and(eq(fleetVehicles.companyId, input.companyId), eq(fleetVehicles.id, input.vehicleId)))
    .limit(1)
  if (vehicle === undefined) return null

  const [reference] = await queryable
    .select({
      cargoHeightM: vehicleVolumeReferences.cargoHeightM,
      cargoLengthM: vehicleVolumeReferences.cargoLengthM,
      cargoWidthM: vehicleVolumeReferences.cargoWidthM,
    })
    .from(vehicleVolumeReferences)
    .where(
      and(
        eq(vehicleVolumeReferences.vehicleType, vehicle.vehicleType),
        eq(vehicleVolumeReferences.bodyType, vehicle.bodyType),
      ),
    )
    .limit(1)

  const referenceM3 =
    reference === undefined
      ? null
      : (resolveVehicleCapacity({ ...reference, capacityM3: null, referenceM3: null })
          ?.capacityM3 ?? null)

  const capacity = resolveVehicleCapacity({
    capacityM3: vehicle.capacityM3,
    cargoHeightM: vehicle.cargoHeightM,
    cargoLengthM: vehicle.cargoLengthM,
    cargoWidthM: vehicle.cargoWidthM,
    referenceM3,
  })
  if (capacity === null) return null

  const factors = await queryable
    .select({
      species: companyCargoVolumeFactors.species,
      volumePerUnitM3: companyCargoVolumeFactors.volumePerUnitM3,
    })
    .from(companyCargoVolumeFactors)
    .where(eq(companyCargoVolumeFactors.companyId, input.companyId))
  const factorBySpecies = new Map(factors.map((row) => [row.species, row.volumePerUnitM3]))
  const defaultFactor = factorBySpecies.get('') ?? null

  const volumes =
    input.nfeDocumentIds.length === 0
      ? []
      : await queryable
          .select({
            documentId: nfeVolumes.documentId,
            quantity: sql<string>`sum(${nfeVolumes.quantity})`,
            species: sql<string>`coalesce(min(nullif(trim(${nfeVolumes.species}), '')), '')`,
          })
          .from(nfeVolumes)
          .where(
            and(
              eq(nfeVolumes.companyId, input.companyId),
              inArray(nfeVolumes.documentId, [...input.nfeDocumentIds]),
            ),
          )
          .groupBy(nfeVolumes.documentId)

  const byDocument = new Map(volumes.map((row) => [row.documentId, row]))
  const documents = input.nfeDocumentIds.map((documentId) => {
    const row = byDocument.get(documentId)
    if (row === undefined) return { source: null, volumeM3: null }
    const resolved = resolveCargoVolume({
      volumeFactor: factorBySpecies.get(row.species) ?? defaultFactor,
      volumeQuantity: row.quantity,
    })
    return { source: resolved?.source ?? null, volumeM3: resolved?.volumeM3 ?? null }
  })

  const occupancy = resolveTripOccupancy({ capacityM3: capacity.capacityM3, documents })
  if (occupancy === null) return null

  return { ...occupancy, capacityM3: capacity.capacityM3, capacitySource: capacity.source }
}
