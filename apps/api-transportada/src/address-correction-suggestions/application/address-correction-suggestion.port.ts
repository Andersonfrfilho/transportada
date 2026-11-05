/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AddressCorrectionSuggestionStatus } from '../../shared/address-correction-suggestion.constant.js'

export type DecideAddressCorrectionSuggestionParams = {
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
  readonly suggestionId: string
}

export type DecidedAddressCorrectionSuggestion = {
  readonly id: string
  readonly status: AddressCorrectionSuggestionStatus
}

/**
 * Spec 294 T3.2: o escritório decide a sugestão do motorista. Aplicar é a correção do operador com o
 * ponto sugerido; as duas decisões gravam a trilha de auditoria na mesma transação.
 */
export type AddressCorrectionSuggestionDecisionPort = {
  apply(
    params: DecideAddressCorrectionSuggestionParams,
  ): Promise<DecidedAddressCorrectionSuggestion>
  dismiss(
    params: DecideAddressCorrectionSuggestionParams,
  ): Promise<DecidedAddressCorrectionSuggestion>
}
