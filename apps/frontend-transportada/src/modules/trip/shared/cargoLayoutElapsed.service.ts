/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145: quanto tempo a planta está sendo calculada. Funções puras; o relógio vem de fora.
 */
import { CARGO_LAYOUT_SLOW_NOTICE_MS } from './trip.constant'

const MILLISECONDS_PER_SECOND = 1_000
const SECONDS_PER_MINUTE = 60

export function resolveCargoLayoutElapsedMs(
  input: Readonly<{ now: number; since: number }>,
): number {
  return Math.max(0, input.now - input.since)
}

/** "0 s", "59 s", "1 min 20 s", "2 min" — as unidades são as mesmas em pt-BR e inglês. */
export function formatCargoLayoutElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / MILLISECONDS_PER_SECOND)
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  if (minutes === 0) return `${String(seconds)} s`
  if (seconds === 0) return `${String(minutes)} min`
  return `${String(minutes)} min ${String(seconds)} s`
}

export function isCargoLayoutWaitLong(elapsedMs: number): boolean {
  return elapsedMs >= CARGO_LAYOUT_SLOW_NOTICE_MS
}
