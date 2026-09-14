/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 143 T007: os três motivos de falha dos gateways do Resend. `resend-account.gateway.ts` só
 * lança um destes quando a causa não é uma pergunta que o próprio caso de uso saiba responder
 * (chave recusada, provedor fora do ar, corpo fora do schema) — quando o Resend responde e o
 * domínio simplesmente não está verificado, isso não é erro, é o `reason` do resultado.
 */
export class ResendProviderUnauthorizedError extends Error {
  public constructor() {
    super('Resend rejected the API key')
    this.name = 'ResendProviderUnauthorizedError'
  }
}

export class ResendProviderUnreachableError extends Error {
  public constructor(cause?: unknown) {
    super('Resend was not reachable', { cause })
    this.name = 'ResendProviderUnreachableError'
  }
}

export class ResendProviderUnexpectedResponseError extends Error {
  public constructor(cause?: unknown) {
    super('Resend responded with a body outside the expected schema', { cause })
    this.name = 'ResendProviderUnexpectedResponseError'
  }
}
