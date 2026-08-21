/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class InvalidPostalCodeError extends ApiError {
  public constructor() {
    super({
      code: 'POSTAL_CODE_INVALID',
      message: 'Postal code must have eight digits',
      status: 400,
    })
  }
}

export class PostalCodeNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'POSTAL_CODE_NOT_FOUND',
      message: 'No address was found for the postal code',
      status: 404,
    })
  }
}
