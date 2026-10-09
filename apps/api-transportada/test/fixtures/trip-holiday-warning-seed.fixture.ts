/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2: o que a integração do aviso por parada semeia — uma viagem com várias paradas, cada uma com
 * a cidade do destino (no `address_key` e no endereço da nota), a ETA e, se for o caso, a conclusão.
 * Semeadura em série, como a do prazo de entrega. Dados inventados.
 */
import { and, eq } from 'drizzle-orm'

import {
  nfeAddresses,
  tripDocuments,
  tripStops,
  trips,
} from '../../src/database/database.schema.js'
import { ISSUER_TAX_ID, type TestDatabase } from './cargo-arrival-database.fixture.js'
import { seedNotes } from './trip-delivery-deadline-seed.fixture.js'

export type SeedStopParams = {
  /** O código que vai no `address_key`; o padrão é o do endereço das notas. */
  readonly addressKeyCityCode?: string
  readonly cityCode: string
  readonly cityName?: string
  readonly completedAt?: Date
  readonly estimatedArrivalAt: Date | null
  readonly noteCount?: number
}

export type SeededStops = {
  /** As notas de cada parada, na ordem das paradas. */
  readonly documentIds: readonly (readonly string[])[]
  readonly stopIds: readonly string[]
  readonly tripId: string
}

/** Uma viagem com uma parada por item, na ordem; as notas de cada parada têm o endereço da cidade dela. */
export async function seedTripWithStops(
  database: TestDatabase,
  params: { readonly companyId: string; readonly stops: readonly SeedStopParams[] },
): Promise<SeededStops> {
  const { companyId } = params
  const tripId = crypto.randomUUID()
  await database.db.insert(trips).values({ companyId, id: tripId })
  const stopIds: string[] = []
  const documentIdsByStop: (readonly string[])[] = []
  let sequence = 0n
  for (const stop of params.stops) {
    sequence += 1n
    const stopId = crypto.randomUUID()
    stopIds.push(stopId)
    const documentIds = await seedNotes(database, {
      cityCodes: [stop.cityCode],
      companyId,
      count: stop.noteCount ?? 1,
      emitterTaxId: ISSUER_TAX_ID,
    })
    documentIdsByStop.push(documentIds)
    if (stop.cityName !== undefined) {
      await database.db
        .update(nfeAddresses)
        .set({ city: stop.cityName })
        .where(and(eq(nfeAddresses.companyId, companyId), eq(nfeAddresses.cityCode, stop.cityCode)))
    }
    await database.db.insert(tripStops).values({
      addressKey: `${stop.addressKeyCityCode ?? stop.cityCode}|01310100|${String(sequence)}`,
      arrivedAt: stop.completedAt ?? null,
      companyId,
      completedAt: stop.completedAt ?? null,
      estimatedArrivalAt: stop.estimatedArrivalAt,
      id: stopId,
      label: `Parada ${String(sequence)}`,
      sequence,
      tripId,
    })
    await database.db.insert(tripDocuments).values(
      documentIds.map((nfeDocumentId) => ({
        companyId,
        id: crypto.randomUUID(),
        nfeDocumentId,
        stopId,
        tripId,
      })),
    )
  }
  return { documentIds: documentIdsByStop, stopIds, tripId }
}
