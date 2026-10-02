/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 234 D3: a hora do evento é a do toque no aparelho corrigida pelo desvio do relógio que o app
 * mediu contra o servidor. Hora corrigida implausível descarta a correção — nunca recusa o evento,
 * porque recusar viraria `422` e o app poderia descartar a entrega por um problema de relógio.
 * Regra pura, sem I/O.
 */
import { MILLISECONDS_PER_DAY } from '../../shared/time.constant.js'
import { DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS } from './field-delivery-timing.policy.js'

export const OCCURRED_AT_MAX_AGE_DAYS = 30

/** Spec 234 D2: o que o app manda junto do evento; ausente é o cliente antigo, nunca `undefined` explícito. */
export type EventClockFields = {
  readonly clockOffsetMs?: number
  readonly tappedAt?: Date
}

export type ResolveOccurredAtParams = {
  /** A hora do aparelho no toque, crua. */
  readonly tappedAt: Date | undefined
  /** Servidor − aparelho, medido pelo app; negativo quando o aparelho está adiantado. */
  readonly clockOffsetMs: number | undefined
  /** Quando o servidor recebeu o evento. */
  readonly receivedAt: Date
}

export type OccurredAtResolution =
  | { readonly kind: 'corrected'; readonly occurredAt: Date }
  | { readonly kind: 'ignored'; readonly reason: 'missing' | 'future' | 'too_old' }

export function resolveOccurredAt(params: ResolveOccurredAtParams): OccurredAtResolution {
  const { clockOffsetMs, receivedAt, tappedAt } = params
  if (tappedAt === undefined || clockOffsetMs === undefined) {
    return { kind: 'ignored', reason: 'missing' }
  }

  const tappedAtMilliseconds = tappedAt.getTime()
  if (!Number.isFinite(tappedAtMilliseconds) || !Number.isFinite(clockOffsetMs)) {
    return { kind: 'ignored', reason: 'missing' }
  }

  // Compara em número antes de criar o Date: fora do alcance dele, o Date seria inválido.
  const occurredAtMilliseconds = tappedAtMilliseconds + clockOffsetMs
  const latestAllowed = receivedAt.getTime() + DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS
  if (occurredAtMilliseconds > latestAllowed) return { kind: 'ignored', reason: 'future' }

  const earliestAllowed = receivedAt.getTime() - OCCURRED_AT_MAX_AGE_DAYS * MILLISECONDS_PER_DAY
  if (occurredAtMilliseconds < earliestAllowed) return { kind: 'ignored', reason: 'too_old' }

  return { kind: 'corrected', occurredAt: new Date(occurredAtMilliseconds) }
}

/** Spec 234 D3: a correção aceita, como o evento a grava (`occurred_at`, `clock_offset_ms`). */
export type CorrectedClock = {
  readonly clockOffsetMs: number
  readonly occurredAt: Date
}

/** O que o evento do motorista grava do relógio: a hora crua do toque e, só se aceita, a corrigida. */
export type RecordedEventClock = {
  readonly correctedClock?: CorrectedClock
  readonly tappedAt?: Date
}

export type ResolveRecordedEventClockParams = ResolveOccurredAtParams & {
  /** O relato trouxe posição: sem ela não há prova de lugar e a hora do aparelho não vale (D4b). */
  readonly hasLocation: boolean
}

/**
 * Spec 234 D3 (risco 2 da T1.5): grava a **decisão** de `resolveOccurredAt`, não o desvio cru — a
 * correção descartada não deixa `occurred_at` nem `clock_offset_ms`, e nenhuma leitura a ressuscita.
 * D4b (T1.5b): sem posição no relato a correção também não vale. O `tapped_at` cru fica mesmo assim,
 * como a spec 206 já o guarda.
 */
export function resolveRecordedEventClock(
  params: ResolveRecordedEventClockParams,
): RecordedEventClock {
  const { clockOffsetMs, hasLocation, receivedAt, tappedAt } = params
  const tapped = tappedAt === undefined ? {} : { tappedAt }
  if (!hasLocation) return tapped

  const resolution = resolveOccurredAt({ clockOffsetMs, receivedAt, tappedAt })
  if (resolution.kind !== 'corrected' || clockOffsetMs === undefined) return tapped

  return { ...tapped, correctedClock: { clockOffsetMs, occurredAt: resolution.occurredAt } }
}
