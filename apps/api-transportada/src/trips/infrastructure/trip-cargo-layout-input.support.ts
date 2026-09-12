/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D5/D7: a mesma entrada que `readTripDetail` monta para `resolveCargoLayout`, extraída para
 * uma consulta própria — é dela que o gatilho eager (T6) hasheia e é ela que a coluna `input` guarda
 * para o worker empacotar sem reler a viagem.
 *
 * ⚠️ Rótulo, cliente e números de nota saem **iguais** aos do detalhe: o hash os ignora (D6), mas a
 * planta que o worker grava é a que a tela desenha — uma etiqueta vazia aqui seria uma caixa sem nome
 * lá. Quem mudar a montagem das paradas em `readTripDetail` muda aqui junto.
 */
import { and, asc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { stampCargoNote, sumVolumes, type CargoLayoutStop } from '@adatechnology/cargo-placement'

import { fleetDrivers, freightCalculations, nfeDocuments } from '../../database/database.schema.js'
import { tripDocuments, tripDrivers, tripStops, trips } from '../../database/trip.schema.js'
import type { BuildCargoLayoutInputParams } from '../domain/cargo-layout-hash.types.js'
import { withPayloadCeiling } from '../domain/trip-cargo-weight.policy.js'
import { listStopAddresses, type NfeDestinationAddress } from './nfe-destination-address.support.js'
import { loadTripCargoWeight } from './trip-cargo-weight.support.js'
import { loadTripOccupancy } from './trip-occupancy.support.js'
import type { TripQueryable } from './trip-queryable.type.js'

const nfeDocumentsViaFreight = alias(nfeDocuments, 'nfe_documents_via_freight')

type TripOccupancy = Awaited<ReturnType<typeof loadTripOccupancy>>

type StopDocument = {
  readonly nfeDocumentId: string | null
  readonly nfeNumber: string | null
}

type StopRecord = {
  readonly id: string
  readonly label: string
  readonly sequence: bigint
}

function buildLayoutStop(params: {
  readonly addresses: ReadonlyMap<string, NfeDestinationAddress>
  readonly cargo: TripOccupancy
  readonly documents: readonly StopDocument[]
  readonly stop: StopRecord
}): CargoLayoutStop {
  const { addresses, cargo, documents, stop } = params
  const address = documents
    .map((document) =>
      document.nfeDocumentId === null ? undefined : addresses.get(document.nfeDocumentId),
    )
    .find((candidate) => candidate !== undefined)
  const volumes = documents.map((document) =>
    document.nfeDocumentId === null
      ? null
      : (cargo.volumeByDocument.get(document.nfeDocumentId) ?? null),
  )
  const known = volumes.filter((volume): volume is string => volume !== null)

  return {
    boxes: documents.flatMap((document) =>
      document.nfeDocumentId === null
        ? []
        : stampCargoNote({
            boxes: cargo.boxesByDocument.get(document.nfeDocumentId) ?? [],
            documentId: document.nfeDocumentId,
            documentNumber: document.nfeNumber,
          }),
    ),
    clientName: address?.recipientName ?? '',
    documentsWithoutVolume: volumes.length - known.length,
    label: address?.label ?? stop.label,
    noteNumbers: documents.flatMap((document) =>
      document.nfeNumber === null ? [] : [document.nfeNumber],
    ),
    sequence: Number(stop.sequence),
    volumeM3: known.length === 0 ? null : sumVolumes(known),
  }
}

async function readStopDocuments(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly tripId: string },
): Promise<readonly (StopDocument & { readonly stopId: string | null })[]> {
  return queryable
    .select({
      nfeDocumentId: tripDocuments.nfeDocumentId,
      /** A mesma coalescência do detalhe: o vínculo por frete guarda a nota um passo adiante. */
      nfeNumber: sql<
        null | string
      >`coalesce(${nfeDocuments.number}, ${nfeDocumentsViaFreight.number})`,
      stopId: tripDocuments.stopId,
    })
    .from(tripDocuments)
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .leftJoin(
      freightCalculations,
      and(
        eq(freightCalculations.companyId, tripDocuments.companyId),
        eq(freightCalculations.id, tripDocuments.freightCalculationId),
      ),
    )
    .leftJoin(
      nfeDocumentsViaFreight,
      and(
        eq(nfeDocumentsViaFreight.companyId, tripDocuments.companyId),
        eq(nfeDocumentsViaFreight.id, freightCalculations.nfeDocumentId),
      ),
    )
    .where(
      and(eq(tripDocuments.companyId, params.companyId), eq(tripDocuments.tripId, params.tripId)),
    )
    .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id))
}

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

  const documentRecords = await readStopDocuments(queryable, params)

  const stopRecords = await queryable
    .select({ id: tripStops.id, label: tripStops.label, sequence: tripStops.sequence })
    .from(tripStops)
    .where(and(eq(tripStops.companyId, params.companyId), eq(tripStops.tripId, params.tripId)))
    .orderBy(asc(tripStops.sequence))

  const documentsByStopId = new Map<string, StopDocument[]>()
  for (const document of documentRecords) {
    if (document.stopId === null) continue
    const bucket = documentsByStopId.get(document.stopId)
    if (bucket === undefined) documentsByStopId.set(document.stopId, [document])
    else bucket.push(document)
  }

  const nfeDocumentIds = documentRecords.flatMap((document) =>
    document.nfeDocumentId === null ? [] : [document.nfeDocumentId],
  )
  const [cargo, cargoWeight, addresses] = await Promise.all([
    loadTripOccupancy(queryable, {
      companyId: params.companyId,
      nfeDocumentIds,
      vehicleId: record.vehicleId,
    }),
    loadTripCargoWeight(queryable, { companyId: params.companyId, nfeDocumentIds }).then(
      (weight) => weight.view,
    ),
    listStopAddresses(queryable, { companyId: params.companyId, nfeDocumentIds }),
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
    stops: stopRecords.map((stop) =>
      buildLayoutStop({
        addresses,
        cargo,
        documents: documentsByStopId.get(stop.id) ?? [],
        stop,
      }),
    ),
  }
}
