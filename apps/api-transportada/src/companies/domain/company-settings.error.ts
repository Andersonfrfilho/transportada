/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class CompanyFiscalProfileConflictError extends ApiError {
  public constructor() {
    super({
      code: 'FISCAL_SETTINGS_CONFLICT',
      message: 'Company fiscal settings conflict',
      status: 409,
    })
  }
}

export class CompanySettingsVersionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'FISCAL_SETTINGS_VERSION_CONFLICT',
      message: 'Company fiscal settings version conflict',
      status: 409,
    })
  }
}

export class FiscalSequenceLockedError extends ApiError {
  public constructor() {
    super({
      code: 'FISCAL_SEQUENCE_LOCKED',
      message: 'Fiscal sequence is locked',
      status: 409,
    })
  }
}

export class InvalidCompanySettingsError extends ApiError {
  public constructor() {
    super({
      code: 'INVALID_COMPANY_SETTINGS',
      message: 'Company fiscal settings are invalid',
      status: 400,
    })
  }
}
