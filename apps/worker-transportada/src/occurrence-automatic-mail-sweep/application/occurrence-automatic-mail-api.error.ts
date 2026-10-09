/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type OccurrenceAutomaticMailApiFailureOutcome =
  | 'api_unauthorized'
  | 'api_unreachable'
  | 'request_rejected'

/** Só o resultado e o status entram na mensagem: o corpo da resposta e o segredo do cliente nunca. */
export class OccurrenceAutomaticMailApiError extends Error {
  override readonly name = 'OccurrenceAutomaticMailApiError'

  constructor(
    readonly outcome: OccurrenceAutomaticMailApiFailureOutcome,
    status?: number,
  ) {
    super(`occurrence_automatic_mail_api_${outcome}${status === undefined ? '' : `:${status}`}`)
  }
}
