/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CanhotoReadFailureOutcome } from '../domain/canhoto-read.constant.js'

export type CanhotoReviewApiFailureOutcome = Extract<
  CanhotoReadFailureOutcome,
  'api_unauthorized' | 'api_unreachable' | 'report_rejected'
>

/** Só o resultado e o status entram na mensagem: o corpo da resposta e o segredo do cliente nunca. */
export class CanhotoReviewApiError extends Error {
  override readonly name = 'CanhotoReviewApiError'

  constructor(
    readonly outcome: CanhotoReviewApiFailureOutcome,
    status?: number,
  ) {
    super(`canhoto_review_api_${outcome}${status === undefined ? '' : `:${status}`}`)
  }
}
