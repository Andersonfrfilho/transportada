/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** total_amount é numeric(14,2): a parte inteira nunca ultrapassa 999 bilhões. */
export class InvoiceAmountOutOfRangeError extends ApiError {
  public constructor() {
    super({
      code: 'BILLING_INVOICE_AMOUNT_OUT_OF_RANGE',
      message: 'Invoice amount exceeds the supported magnitude for amount-in-words conversion',
      status: 422,
    })
  }
}
