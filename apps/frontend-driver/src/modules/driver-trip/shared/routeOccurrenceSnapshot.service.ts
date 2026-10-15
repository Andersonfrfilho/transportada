/* Copyright (c) 2026 Ada Technology. MIT License. */
import { SERVER_ERROR_MIN_STATUS } from '@/modules/conversation/shared/driverConversation.constant'
import type {
  DriverRouteOccurrence,
  RouteOccurrenceSnapshotStore,
  RouteOccurrencesQueryData,
  RouteOccurrencesReadResult,
  StoredRouteOccurrences,
} from './driverRouteOccurrence.types'

/**
 * Spec 266 (RF9): a última lista de ocorrências guardada para abrir sem rede. Só metadado — link
 * assinado de 5 min nunca vai para o aparelho. É por **viagem**: viagem trocada ou finalizada apaga.
 */
export async function loadRouteOccurrences(input: {
  readonly now: Date
  readonly readList: () => Promise<RouteOccurrencesReadResult<readonly DriverRouteOccurrence[]>>
  readonly store: RouteOccurrenceSnapshotStore
  readonly tripId: string
}): Promise<RouteOccurrencesQueryData> {
  let result: RouteOccurrencesReadResult<readonly DriverRouteOccurrence[]>
  try {
    result = await input.readList()
  } catch (error) {
    const stored = await input.store.read(input.tripId).catch(() => undefined)
    if (stored === undefined || !isServiceUnavailable(error)) throw error
    return {
      isFromSnapshot: true,
      occurrences: stored.occurrences,
      savedAt: stored.savedAt,
      status: 'loaded',
    }
  }

  if (result.status === 'tripFinished') {
    await input.store.remove(input.tripId).catch(() => undefined)
    return { status: 'tripFinished' }
  }

  const record: StoredRouteOccurrences = {
    occurrences: result.data,
    savedAt: input.now.toISOString(),
    tripId: input.tripId,
  }
  /** Falhar ao guardar não derruba a tela: só o próximo boot sem rede abre algo mais velho. */
  await input.store
    .retainOnly(input.tripId)
    .then(() => input.store.write(record))
    .catch(() => undefined)
  return { isFromSnapshot: false, occurrences: result.data, savedAt: undefined, status: 'loaded' }
}

/** Rede fora ou servidor com defeito: os únicos casos em que o retrato vale; 4xx é resposta, não queda. */
function isServiceUnavailable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { isOffline, status } = error as { isOffline?: unknown; status?: unknown }
  return isOffline === true || (typeof status === 'number' && status >= SERVER_ERROR_MIN_STATUS)
}
