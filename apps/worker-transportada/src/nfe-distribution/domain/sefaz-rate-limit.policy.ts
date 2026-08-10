/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

const RATE_LIMIT_CSTAT = '656'
const RATE_LIMIT_SIGNATURE = `cStat ${RATE_LIMIT_CSTAT}`

/**
 * O pacote fiscal sinaliza o 656 de dois jeitos: rejeição tipada com `code`, quando a resposta
 * chega classificada, e `Error` cru com o cStat na mensagem, quando o parser da distribuição barra
 * antes. Ler `rawResponse` está fora de questão — ali vai o XML da SEFAZ.
 */
export function isSefazDistributionRateLimit(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }

  const candidate = error as { readonly code?: unknown; readonly message?: unknown }
  if (candidate.code === RATE_LIMIT_CSTAT) {
    return true
  }

  return typeof candidate.message === 'string' && candidate.message.includes(RATE_LIMIT_SIGNATURE)
}
