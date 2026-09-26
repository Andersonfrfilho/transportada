/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RateLimitSubjectService } from './rate-limit-subject.service'
import type { RateLimitWindowStorePort } from './rate-limit-window.port'
import type { PostgresRateLimitPolicy, RateLimiter, RateLimitOutcome } from './rate-limiter.service'

const MILLISECONDS_PER_SECOND = 1_000

/** O roteador entrega isto à rota: o alvo só existe depois do `parse`, e quem conta é o roteador. */
export type AnonymousTargetGate = (input: {
  readonly policy: PostgresRateLimitPolicy
  readonly target: string
}) => Promise<RateLimitOutcome>

export type AnonymousRateLimit = Readonly<{
  consumeClientIp: (input: {
    readonly clientIp: string
    readonly policy: PostgresRateLimitPolicy
  }) => Promise<RateLimitOutcome>
  consumeTarget: AnonymousTargetGate
}>

type SharedAnonymousRateLimit = Readonly<{
  subjects: RateLimitSubjectService
  windows: RateLimitWindowStorePort
}>

/**
 * Spec 191 RF12, ADR-0076 §3: dois estágios. O balde em memória da réplica, com o mesmo teto,
 * recusa sem tocar no banco — uma rajada de uma origem só não vira escrita no Postgres. O que passa
 * consome `rate_limit_windows`, que soma entre réplicas. A memória abre a janela no primeiro pedido
 * e o Postgres a alinha à época: perto da virada, a memória recusa um pouco a mais, nunca a menos.
 *
 * Sem try/catch: o store fora do ar derruba o pedido em 500, nunca o deixa passar (fail-closed).
 */
export function createAnonymousRateLimit(input: {
  readonly rateLimiter: RateLimiter
  readonly rateLimitSubjects: RateLimitSubjectService | undefined
  readonly rateLimitWindows: RateLimitWindowStorePort | undefined
}): AnonymousRateLimit {
  function requireShared(): SharedAnonymousRateLimit {
    // A guarda de boot do roteador já recusa rota `postgres` sem os dois; aqui só falha fechado.
    if (input.rateLimitWindows === undefined || input.rateLimitSubjects === undefined) {
      throw new Error('anonymous postgres rate limit without a store or a subject key')
    }
    return { subjects: input.rateLimitSubjects, windows: input.rateLimitWindows }
  }

  async function consume(params: {
    readonly policy: PostgresRateLimitPolicy
    readonly subjectKey: string
    readonly windows: RateLimitWindowStorePort
  }): Promise<RateLimitOutcome> {
    const local = input.rateLimiter.consume({
      key: `${params.policy.scope} ${params.subjectKey}`,
      policy: {
        maxRequests: params.policy.maxRequests,
        windowMs: params.policy.windowSeconds * MILLISECONDS_PER_SECOND,
      },
    })
    if (!local.allowed) return local

    return params.windows.consume({
      maxRequests: params.policy.maxRequests,
      scope: params.policy.scope,
      subjectKey: params.subjectKey,
      windowSeconds: params.policy.windowSeconds,
    })
  }

  return Object.freeze({
    async consumeClientIp({ clientIp, policy }) {
      const shared = requireShared()
      const subjectKey = shared.subjects.forClientIp({ clientIp, scope: policy.scope })
      return consume({ policy, subjectKey, windows: shared.windows })
    },
    async consumeTarget({ policy, target }) {
      const shared = requireShared()
      const subjectKey = shared.subjects.forTarget({ scope: policy.scope, target })
      return consume({ policy, subjectKey, windows: shared.windows })
    },
  })
}
