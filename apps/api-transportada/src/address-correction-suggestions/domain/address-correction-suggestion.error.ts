/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** Inexistente ou de outra empresa recebem a mesma resposta: não revela qual dos dois. */
export class AddressCorrectionSuggestionNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'ADDRESS_CORRECTION_SUGGESTION_NOT_FOUND',
      message: 'Address correction suggestion was not found',
      status: 404,
    })
  }
}

export class AddressCorrectionSuggestionAlreadyDecidedError extends ApiError {
  public constructor() {
    super({
      code: 'ADDRESS_CORRECTION_SUGGESTION_ALREADY_DECIDED',
      message: 'Address correction suggestion was already applied or dismissed',
      status: 409,
    })
  }
}
