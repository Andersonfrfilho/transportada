/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverOccurrenceType } from './driverTrip.types'
import type { RouteOccurrenceEntry } from './routeOccurrenceView.types'

const MS_PER_MINUTE = 60_000

/**
 * Spec 315 (D10, T7b): o tipo com espera mínima só abre depois de `chegada + N min`. O servidor cobra (422
 * `TRIP_OCCURRENCE_MIN_WAIT_NOT_REACHED`); o app só esconde a opção até lá e mostra quanto falta, com o relógio
 * corrigido pelo desvio do servidor (`readCorrectedNowMs`), nunca o do aparelho puro.
 */
export type OccurrenceAvailability =
  | Readonly<{ status: 'available' }>
  /** Já existe ocorrência aberta (do escritório ou deste app) do mesmo tipo nesta parada — não abre outra. */
  | Readonly<{ status: 'alreadyOpen' }>
  /** Sem "Cheguei": a espera conta da chegada, e a hora digitada na ocorrência nunca a substitui. */
  | Readonly<{ status: 'needsArrival' }>
  /** Chegada tocada, mas ainda sem horário vindo do servidor (fila): não dá para contar. */
  | Readonly<{ status: 'arrivalSyncing' }>
  | Readonly<{ availableAtMs: number; remainingMinutes: number; status: 'waiting' }>

export function hasMinWait(type: DriverOccurrenceType): boolean {
  return typeof type.minWaitAfterArrivalMinutes === 'number' && type.minWaitAfterArrivalMinutes > 0
}

/** Ocorrência da parada ainda viva (fila ou aberta) do tipo — recusada, resolvida e cancelada não bloqueiam. */
export function isOccurrenceOpenForType(input: {
  readonly entries: readonly RouteOccurrenceEntry[]
  readonly typeId: string
}): boolean {
  return input.entries.some(
    (entry) =>
      entry.typeId === input.typeId && (entry.state === 'queued' || entry.state === 'open'),
  )
}

export function resolveOccurrenceAvailability(input: {
  readonly arrivedAt: string | null
  readonly isArrivalRecorded: boolean
  /** As ocorrências já registradas na parada (nível da parada), do servidor e da fila. */
  readonly openEntries: readonly RouteOccurrenceEntry[]
  readonly nowMs: number
  readonly type: DriverOccurrenceType
}): OccurrenceAvailability {
  const { type } = input
  if (!hasMinWait(type)) return { status: 'available' }
  if (isOccurrenceOpenForType({ entries: input.openEntries, typeId: type.id })) {
    return { status: 'alreadyOpen' }
  }
  if (input.arrivedAt === null) {
    return { status: input.isArrivalRecorded ? 'arrivalSyncing' : 'needsArrival' }
  }
  const arrivedMs = Date.parse(input.arrivedAt)
  if (!Number.isFinite(arrivedMs)) return { status: 'arrivalSyncing' }
  const availableAtMs = arrivedMs + (type.minWaitAfterArrivalMinutes ?? 0) * MS_PER_MINUTE
  if (input.nowMs >= availableAtMs) return { status: 'available' }
  return {
    availableAtMs,
    remainingMinutes: Math.max(1, Math.ceil((availableAtMs - input.nowMs) / MS_PER_MINUTE)),
    status: 'waiting',
  }
}
