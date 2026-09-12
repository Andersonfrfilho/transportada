/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D6/D7: o mesmo retrato de entrada que `readTripDetail` monta para `resolveCargoLayout`,
 * extraído para uma consulta própria — é dele que o gatilho eager (T6) hasheia sem esperar a
 * leitura completa da viagem (contatos, endereços e rótulo, que não entram no hash de qualquer
 * forma — D6 já os deixa de fora).
 *
 * ⚠️ `label`/`documentsWithoutVolume`/`volumeM3`/`clientName`/`noteNumbers` aqui são só o que o tipo
 * `CargoLayoutStop` exige para compilar: `buildStopInput` (`cargo-layout-hash.policy.ts`) só lê
 * `boxes` e `sequence` de cada parada — os demais nunca chegam ao hash.
 */
import { and, asc, eq } from 'drizzle-orm'

import { stampCargoNote } from '@adatechnology/cargo-placement'

import { fleetDrivers } from '../../database/database.schema.js'
import { tripDocuments, tripDrivers, tripStops, trips } from '../../database/trip.schema.js'
import type { BuildCargoLayoutInputParams } from '../domain/cargo-layout-hash.types.js'
import { withPayloadCeiling } from '../domain/trip-cargo-weight.policy.js'
import { loadTripCargoWeight } from './trip-cargo-weight.support.js'
import { loadTripOccupancy } from './trip-occupancy.support.js'
import type { TripQueryable } from './trip-queryable.type.js'

export async function readCargoLayoutInputParams(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly tripId: string },
): Promise<BuildCargoLayoutInputParams | null> {
  const [record] = await queryable
    .select({ vehicleId: trips.vehicleId })
    .from(trips)
    .where(and(eq(trips.companyId, params.companyId), eq(trips.id, params.tripId)))
    .limit(1)
  if (record === undefined) return null

  const driverRecords = await queryable
    .select({ driverSecuresCargo: fleetDrivers.securesCargo })
    .from(tripDrivers)
    .leftJoin(
      fleetDrivers,
      and(
        eq(fleetDrivers.companyId, tripDrivers.companyId),
        eq(fleetDrivers.id, tripDrivers.driverId),
      ),
    )
    .where(and(eq(tripDrivers.companyId, params.companyId), eq(tripDrivers.tripId, params.tripId)))

  const documentRecords = await queryable
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId, stopId: tripDocuments.stopId })
    .from(tripDocuments)
    .where(
      and(eq(tripDocuments.companyId, params.companyId), eq(tripDocuments.tripId, params.tripId)),
    )

  const stopRecords = await queryable
    .select({ id: tripStops.id, sequence: tripStops.sequence })
    .from(tripStops)
    .where(and(eq(tripStops.companyId, params.companyId), eq(tripStops.tripId, params.tripId)))
    .orderBy(asc(tripStops.sequence))

  const documentIdsByStopId = new Map<string, string[]>()
  for (const document of documentRecords) {
    if (document.stopId === null || document.nfeDocumentId === null) continue
    const bucket = documentIdsByStopId.get(document.stopId)
    if (bucket === undefined) documentIdsByStopId.set(document.stopId, [document.nfeDocumentId])
    else bucket.push(document.nfeDocumentId)
  }

  const nfeDocumentIds = documentRecords.flatMap((document) =>
    document.nfeDocumentId === null ? [] : [document.nfeDocumentId],
  )
  const [cargo, cargoWeight] = await Promise.all([
    loadTripOccupancy(queryable, {
      companyId: params.companyId,
      nfeDocumentIds,
      vehicleId: record.vehicleId,
    }),
    loadTripCargoWeight(queryable, { companyId: params.companyId, nfeDocumentIds }).then(
      (weight) => weight.view,
    ),
  ])
  const cargoWeightWithCeiling = withPayloadCeiling({
    maxPayloadKg: cargo.maxPayloadKg,
    view: cargoWeight,
  })

  return {
    bedDimensions: cargo.bedDimensions,
    capacityM3: cargo.capacityM3,
    fallbackBoxVolumeM3: cargo.fallbackBoxVolumeM3,
    loadingAccess: cargo.loadingAccess,
    measuredShapes: cargo.measuredShapes,
    payloadRatio: cargoWeightWithCeiling?.payloadRatio ?? null,
    securesCargo:
      driverRecords.length > 0 && driverRecords.every((row) => row.driverSecuresCargo === true),
    stops: stopRecords.map((row) => ({
      boxes: (documentIdsByStopId.get(row.id) ?? []).flatMap((documentId) =>
        stampCargoNote({
          boxes: cargo.boxesByDocument.get(documentId) ?? [],
          documentId,
          documentNumber: null,
        }),
      ),
      documentsWithoutVolume: 0,
      label: '',
      sequence: Number(row.sequence),
      volumeM3: null,
    })),
  }
}
