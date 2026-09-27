/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHmac } from 'node:crypto'

/** Versão no domínio: trocar o formato da mensagem vira `v2` sem colidir com baldes vivos. */
const SUBJECT_DOMAIN = 'transportada:rate-limit:v1'

export type RateLimitSubjectService = Readonly<{
  forClientIp: (input: { readonly clientIp: string; readonly scope: string }) => string
  forTarget: (input: { readonly scope: string; readonly target: string }) => string
}>

/**
 * ADR-0076 §3: a chave da rota anônima chega a `rate_limit_windows` como HMAC-SHA256, com chave
 * própria e o escopo no domínio. A tabela guarda a janela por até 24 h; com IP ou o texto digitado
 * em claro, ela viraria lista de PII. O escopo no domínio impede que o mesmo IP ou o mesmo texto dê
 * a mesma chave em rotas diferentes, e o tipo (`ip`, `target`) separa as duas famílias.
 */
export function createRateLimitSubjectService(input: {
  readonly key: Uint8Array
}): RateLimitSubjectService {
  function digest(params: {
    readonly kind: string
    readonly scope: string
    readonly value: string
  }): string {
    const message = `${SUBJECT_DOMAIN}:${params.scope}\u0000${params.kind}\u0000${params.value}`
    const mac = createHmac('sha256', input.key).update(message).digest('base64url')
    return `${params.kind}:${mac}`
  }

  return Object.freeze({
    forClientIp: ({ clientIp, scope }) => digest({ kind: 'ip', scope, value: clientIp }),
    forTarget: ({ scope, target }) => digest({ kind: 'target', scope, value: target }),
  })
}
