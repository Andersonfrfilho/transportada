/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O log de falha dizia só o canal, e a causa ficava invisível: porta bloqueada, chave inválida e
 * domínio não verificado saíam iguais. Só o código e o desfecho do provedor entram — nunca a
 * mensagem, que pode carregar o endereço de quem recebe.
 */
export function readDeliveryFailure(error: unknown): {
  readonly errorCode?: string
  readonly outcome?: string
} {
  if (typeof error !== 'object' || error === null) return {}
  const errorCode = 'errorCode' in error ? error.errorCode : undefined
  const outcome = 'outcome' in error ? error.outcome : undefined
  return {
    ...(typeof errorCode === 'string' ? { errorCode } : {}),
    ...(typeof outcome === 'string' ? { outcome } : {}),
  }
}
