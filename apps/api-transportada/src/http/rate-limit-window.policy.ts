/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type ResolveRateLimitWindowStartParams = Readonly<{
  nowSeconds: number
  windowSeconds: number
}>

export type ResolveRetryAfterSecondsParams = Readonly<{
  nowSeconds: number
  windowSeconds: number
  windowStartSeconds: number
}>

export type IsWithinRateLimitParams = Readonly<{
  hits: number
  maxRequests: number
}>

/**
 * Janela fixa alinhada ao relógio, a mesma conta do `INSERT … ON CONFLICT` do limitador: duas
 * réplicas no mesmo instante caem na mesma linha, sem combinar nada entre si.
 */
export function resolveRateLimitWindowStartSeconds({
  nowSeconds,
  windowSeconds,
}: ResolveRateLimitWindowStartParams): number {
  return Math.floor(nowSeconds / windowSeconds) * windowSeconds
}

/** `Retry-After: 0` convida o cliente a martelar no mesmo segundo: o piso é 1. */
export function resolveRetryAfterSeconds({
  nowSeconds,
  windowSeconds,
  windowStartSeconds,
}: ResolveRetryAfterSecondsParams): number {
  return Math.max(1, Math.ceil(windowStartSeconds + windowSeconds - nowSeconds))
}

export function isWithinRateLimit({ hits, maxRequests }: IsWithinRateLimitParams): boolean {
  return hits <= maxRequests
}
