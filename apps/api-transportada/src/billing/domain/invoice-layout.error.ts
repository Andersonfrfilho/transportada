/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class InvoiceFiscalProfileMissingError extends ApiError {
  public constructor() {
    super({
      code: 'BILLING_INVOICE_FISCAL_PROFILE_MISSING',
      message: 'Company has no fiscal profile to print on the invoice PDF header',
      status: 422,
    })
  }
}
