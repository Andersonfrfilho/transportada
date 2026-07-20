/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class DigitalCertificateRejectedError extends ApiError {
  public constructor() {
    super({
      code: 'DIGITAL_CERTIFICATE_REJECTED',
      message: 'Digital certificate was rejected',
      status: 400,
    })
  }
}

export class DigitalCertificateOperationFailedError extends ApiError {
  public constructor() {
    super({
      code: 'DIGITAL_CERTIFICATE_OPERATION_FAILED',
      message: 'Digital certificate operation failed',
      status: 500,
    })
  }
}

export class DigitalCertificateUnavailableError extends ApiError {
  public constructor() {
    super({
      code: 'DIGITAL_CERTIFICATE_UNAVAILABLE',
      message: 'Digital certificate is unavailable',
      status: 500,
    })
  }
}

export class DigitalCertificateIdempotencyConflictError extends ApiError {
  public constructor() {
    super({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key cannot be reused',
      status: 409,
    })
  }
}
