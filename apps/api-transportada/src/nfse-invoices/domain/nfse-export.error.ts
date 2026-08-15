/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class NfseExportLimitExceededError extends ApiError {
  public constructor(maximum: number) {
    super({
      code: 'NFSE_EXPORT_LIMIT_EXCEEDED',
      message: `NFS-e document export is limited to ${maximum} invoices per request`,
      status: 422,
    })
  }
}

export class NfseExportEmptyError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_EXPORT_EMPTY',
      message: 'No archived NFS-e document matches the requested selection',
      status: 422,
    })
  }
}
