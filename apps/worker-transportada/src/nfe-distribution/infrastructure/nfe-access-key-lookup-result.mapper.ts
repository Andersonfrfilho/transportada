/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DfeItem } from '@adatechnology/fiscal-provider'

import type { AccessKeyLookupGatewayResult } from '../../nfe-access-key-lookup/domain/nfe-access-key-lookup.types.js'

const CSTAT_PATTERN = /^\d{3}$/
const SEFAZ_MESSAGE_PREFIX = 'SEFAZ '
const CSTAT_IN_MESSAGE_PATTERN = /\bcStat (\d{3})\b/
const UNAVAILABLE_ERROR_CODES: ReadonlySet<string> = new Set([
  'FISCAL_CONNECTION_ERROR',
  'FISCAL_TIMEOUT',
])

export function mapAccessKeyLookupItem(item: DfeItem | undefined): AccessKeyLookupGatewayResult {
  return item === undefined ? { kind: 'not-found' } : { kind: 'document', item }
}

/**
 * O pacote não expõe o cStat de forma estruturada: lança `Error` cru com `cStat NNN` na mensagem
 * (parser da distribuição). `code` de três dígitos numa mensagem da SEFAZ (rejeição tipada) vale primeiro; mensagem sem
 * cStat (corpo que não é da SEFAZ, como HTML de 5xx) é indisponibilidade; o resto é bug e sobe.
 * `rawResponse` nunca é lido: ali vai o XML da SEFAZ.
 */
export function mapAccessKeyLookupError(error: unknown): AccessKeyLookupGatewayResult {
  if (!(error instanceof Error)) throw error

  const code = (error as { readonly code?: unknown }).code
  if (typeof code === 'string') {
    const isSefazMessage = error.message.startsWith(SEFAZ_MESSAGE_PREFIX)
    if (CSTAT_PATTERN.test(code) && isSefazMessage) return { kind: 'sefaz-rejection', cStat: code }
    if (UNAVAILABLE_ERROR_CODES.has(code)) return { kind: 'unavailable' }
  }

  const cStat = CSTAT_IN_MESSAGE_PATTERN.exec(error.message)?.[1]
  if (cStat !== undefined) return { kind: 'sefaz-rejection', cStat }
  if (error.message.startsWith('SEFAZ NFeDistribuicaoDFe cStat')) return { kind: 'unavailable' }
  throw error
}
