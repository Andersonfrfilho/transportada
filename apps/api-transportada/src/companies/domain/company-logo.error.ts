/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class CompanyLogoNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'COMPANY_LOGO_NOT_FOUND',
      message: 'Company logo was not found',
      status: 404,
    })
  }
}

export class CompanyLogoTooLargeError extends ApiError {
  public constructor() {
    super({
      code: 'COMPANY_LOGO_TOO_LARGE',
      message: 'Company logo exceeds the maximum accepted size',
      status: 413,
    })
  }
}

export class CompanyLogoUnsupportedFormatError extends ApiError {
  public constructor() {
    super({
      code: 'COMPANY_LOGO_UNSUPPORTED_FORMAT',
      message: 'Company logo must be a PNG or JPEG image',
      status: 400,
    })
  }
}
