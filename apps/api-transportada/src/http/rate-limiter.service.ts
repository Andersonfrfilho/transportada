/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type RateLimitPolicy = Readonly<{
  /** Quantas requisições o mesmo balde aceita dentro da janela. */
  maxRequests: number
  /** Duração da janela deslizante, em milissegundos. */
  windowMs: number
}>

export type RateLimitOutcome = Readonly<
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number }
>

export type RateLimiter = Readonly<{
  consume: (input: { readonly key: string; readonly policy: RateLimitPolicy }) => RateLimitOutcome
  size: () => number
}>

type CreateRateLimiterParams = Readonly<{
  maxEntries?: number
  now?: () => number
}>

type Bucket = { count: number; windowMs: number; windowStartedAt: number }

/** Teto do mapa: cada balde custa uma chave curta e três números — 50 mil cabem em poucos MB. */
const DEFAULT_MAX_ENTRIES = 50_000

/**
 * Janela fixa por chave (`rota:método:IP`), em memória do próprio processo — não sobrevive a
 * restart nem soma entre réplicas. O mapa tem teto (ADR-0065): chegando nele, varre os expirados,
 * cada balde pela **própria** janela (a do chamador apagaria balde vivo de rota com janela mais
 * longa), e se ainda estiver cheio despeja o mais antigo. Despejar zera o contador de alguém; o
 * contrário — recusar chave nova — negaria a rota a todo cliente novo.
 */
export function createRateLimiter({
  maxEntries = DEFAULT_MAX_ENTRIES,
  now = Date.now,
}: CreateRateLimiterParams = {}): RateLimiter {
  const buckets = new Map<string, Bucket>()

  function makeRoom(currentTime: number): void {
    if (buckets.size < maxEntries) return
    for (const [key, bucket] of buckets) {
      if (currentTime - bucket.windowStartedAt >= bucket.windowMs) buckets.delete(key)
    }
    const oldest = buckets.keys().next()
    if (buckets.size >= maxEntries && oldest.done !== true) buckets.delete(oldest.value)
  }

  return {
    consume({ key, policy }): RateLimitOutcome {
      const currentTime = now()
      const existing = buckets.get(key)

      if (existing === undefined || currentTime - existing.windowStartedAt >= policy.windowMs) {
        buckets.delete(key)
        makeRoom(currentTime)
        buckets.set(key, { count: 1, windowMs: policy.windowMs, windowStartedAt: currentTime })
        return { allowed: true }
      }

      if (existing.count < policy.maxRequests) {
        existing.count += 1
        return { allowed: true }
      }

      const elapsedMs = currentTime - existing.windowStartedAt
      const retryAfterSeconds = Math.max(1, Math.ceil((policy.windowMs - elapsedMs) / 1000))
      return { allowed: false, retryAfterSeconds }
    },
    size: () => buckets.size,
  }
}
