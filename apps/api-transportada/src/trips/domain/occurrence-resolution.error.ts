/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: os erros do andamento da ocorrência. A ocorrência cancelada recusa resolver e
 * reabrir com o `OccurrenceCancelledError` que a spec 167 já definiu (mesmo código, mesmo 409).
 */
import { ApiError } from '../../shared/api.error.js'

/** Resolver uma ocorrência já resolvida é 409, nunca um segundo evento silencioso. */
export class OccurrenceAlreadyResolvedError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_ALREADY_RESOLVED',
      message: 'This occurrence is already resolved.',
      status: 409,
    })
  }
}

/** Reabrir uma ocorrência que não está resolvida não tem o que reabrir. */
export class OccurrenceNotResolvedError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_NOT_RESOLVED',
      message: 'This occurrence is not resolved, so there is nothing to reopen.',
      status: 409,
    })
  }
}
