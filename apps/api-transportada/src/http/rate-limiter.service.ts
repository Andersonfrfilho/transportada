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
}>

type Bucket = { count: number; windowStartedAt: number }

/** Acima disto, cada `consume()` aproveita para varrer baldes expirados antes de crescer mais. */
const SWEEP_THRESHOLD_ENTRIES = 10_000

/**
 * Janela fixa por chave (`rota:método:IP`), em memória do próprio processo — não sobrevive a
 * restart nem soma entre réplicas, e é exatamente o que a instrução do usuário pediu (sem Redis
 * novo agora). Baldes expirados morrem quando alguém bate neles de novo (o `if` de baixo já
 * substitui); a varredura só entra quando o mapa passa de `SWEEP_THRESHOLD_ENTRIES` — sem ela, um
 * IP que bateu uma vez e nunca mais voltou ocuparia memória para sempre.
 */
export function createRateLimiter(): RateLimiter {
  const buckets = new Map<string, Bucket>()

  function sweepExpired(now: number, maxWindowMs: number): void {
    if (buckets.size < SWEEP_THRESHOLD_ENTRIES) return
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStartedAt >= maxWindowMs) buckets.delete(key)
    }
  }

  return {
    consume({ key, policy }): RateLimitOutcome {
      const now = Date.now()
      sweepExpired(now, policy.windowMs)
      const existing = buckets.get(key)

      if (existing === undefined || now - existing.windowStartedAt >= policy.windowMs) {
        buckets.set(key, { count: 1, windowStartedAt: now })
        return { allowed: true }
      }

      if (existing.count < policy.maxRequests) {
        existing.count += 1
        return { allowed: true }
      }

      const elapsedMs = now - existing.windowStartedAt
      const retryAfterSeconds = Math.max(1, Math.ceil((policy.windowMs - elapsedMs) / 1000))
      return { allowed: false, retryAfterSeconds }
    },
  }
}
