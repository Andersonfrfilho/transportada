/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip } from './driverTrip.types'
import type { AttachmentStore } from './offlineAttachments.service'
import type { OfflineQueueStore, QueuedReport } from './offlineQueue.service'
import { isConcludedTripStatus } from './tripSnapshot.service'

/**
 * Pedido do Anderson (10/11/2026): viagem que o escritório já concluiu (ou cancelou) não deixa
 * evento pendente no aparelho do motorista — não há mais o que registrar nela, e a lista só cresceria.
 *
 * O item da fila não guarda a viagem; ele aponta para uma nota (`documentId`), uma parada (`stopId`) ou
 * a própria viagem (`tripId`, despacho). A API devolve a viagem concluída por 15 min (spec 225), e é
 * nessa janela que o app a reconhece. Só sai o item que aponta para uma viagem concluída **desta
 * resposta**; item sem referência ou de viagem aberta nunca sai.
 */
function readReferences(report: QueuedReport['report']): {
  documentId?: string
  stopId?: string
  tripId?: string
} {
  const candidate = report as { documentId?: unknown; stopId?: unknown; tripId?: unknown }
  return {
    ...(typeof candidate.documentId === 'string' ? { documentId: candidate.documentId } : {}),
    ...(typeof candidate.stopId === 'string' ? { stopId: candidate.stopId } : {}),
    ...(typeof candidate.tripId === 'string' ? { tripId: candidate.tripId } : {}),
  }
}

export function listQueuedOfConcludedTrips(input: {
  readonly ownerSubHash: string
  readonly queued: readonly QueuedReport[]
  readonly trips: readonly DriverTrip[]
}): readonly QueuedReport[] {
  const concludedTripIds = new Set<string>()
  const concludedStopIds = new Set<string>()
  const concludedDocumentIds = new Set<string>()
  const openIds = new Set<string>()
  for (const trip of input.trips) {
    const target = isConcludedTripStatus(trip.status)
    if (target) concludedTripIds.add(trip.id)
    else openIds.add(trip.id)
    for (const stop of trip.stops) {
      if (target) concludedStopIds.add(stop.id)
      else openIds.add(stop.id)
      for (const document of stop.documents) {
        if (target) concludedDocumentIds.add(document.id)
        else openIds.add(document.id)
      }
    }
  }

  return input.queued.filter((item) => {
    if (item.subHash !== input.ownerSubHash) return false
    const { documentId, stopId, tripId } = readReferences(item.report)
    const references = [documentId, stopId, tripId].filter(
      (reference): reference is string => reference !== undefined,
    )
    if (references.length === 0) return false
    /** Referência que também aparece numa viagem aberta (nota movida de viagem) não é descartada. */
    if (references.some((reference) => openIds.has(reference))) return false
    return (
      (documentId !== undefined && concludedDocumentIds.has(documentId)) ||
      (stopId !== undefined && concludedStopIds.has(stopId)) ||
      (tripId !== undefined && concludedTripIds.has(tripId))
    )
  })
}

/** Tira da fila e dos anexos o que é de viagem concluída; devolve o que saiu, para o histórico. */
export async function purgeConcludedTripQueue(input: {
  readonly attachmentStore: AttachmentStore
  readonly ownerSubHash: string
  readonly store: OfflineQueueStore
  readonly trips: readonly DriverTrip[]
}): Promise<readonly QueuedReport[]> {
  const targets = listQueuedOfConcludedTrips({
    ownerSubHash: input.ownerSubHash,
    queued: await input.store.read(),
    trips: input.trips,
  })
  if (targets.length === 0) return []
  const keys = new Set(targets.map((item) => item.report.idempotencyKey))
  await input.store.update((items) => items.filter((item) => !keys.has(item.report.idempotencyKey)))
  for (const key of keys) {
    await input.attachmentStore.update({ eventKey: key, mutate: () => [] })
  }

  return targets
}
