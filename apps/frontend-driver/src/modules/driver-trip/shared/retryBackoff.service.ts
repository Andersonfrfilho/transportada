/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/retryBackoff.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 254 C1–C3: 30 s dobrando a cada falha, teto de 10 min, jitter de ±20 %. */
export const RETRY_BACKOFF_BASE_MS = 30_000
export const RETRY_BACKOFF_CEILING_MS = 600_000
export const RETRY_BACKOFF_JITTER_RATIO = 0.2

/** `timer` respeita o espaçamento; `immediate` (rede voltou, abertura, "Enviar agora") o ignora. */
export type DrainOrigin = 'immediate' | 'timer'

export type RetryDelayParams = Readonly<{
  attempts: number
  random?: (() => number) | undefined
}>

export type RetryDueParams = Readonly<{
  item: Readonly<{ attempts: number; lastAttemptAt?: string | undefined }>
  now: Date
  random?: (() => number) | undefined
}>

/** Espera mínima antes da próxima tentativa do temporizador, dado quantas falhas de rede o item já teve. */
export function computeRetryDelayMs(params: RetryDelayParams): number {
  const random = params.random ?? Math.random
  const exponent = Math.max(params.attempts - 1, 0)
  const unjitteredDelay = Math.min(RETRY_BACKOFF_BASE_MS * 2 ** exponent, RETRY_BACKOFF_CEILING_MS)
  const jitterFactor = 1 + (random() * 2 - 1) * RETRY_BACKOFF_JITTER_RATIO
  return unjitteredDelay * jitterFactor
}

/** Item gravado antes do espaçamento existir (sem `lastAttemptAt`) é sempre devido: nada trava na migração. */
export function isRetryDue(params: RetryDueParams): boolean {
  const { item, now } = params
  if (item.attempts === 0) return true
  if (item.lastAttemptAt === undefined) return true
  const lastAttemptMs = Date.parse(item.lastAttemptAt)
  if (Number.isNaN(lastAttemptMs)) return true
  const delay = computeRetryDelayMs({ attempts: item.attempts, random: params.random })
  return now.getTime() >= lastAttemptMs + delay
}
