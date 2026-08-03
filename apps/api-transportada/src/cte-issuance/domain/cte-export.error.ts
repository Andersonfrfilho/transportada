/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class CteExportLimitExceededError extends ApiError {
  public constructor(maximum: number) {
    super({
      code: 'CTE_EXPORT_LIMIT_EXCEEDED',
      message: `CT-e XML export is limited to ${maximum} documents per request`,
      status: 422,
    })
  }
}

export class CteExportEmptyError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_EXPORT_EMPTY',
      message: 'No authorized CT-e document matches the requested selection',
      status: 422,
    })
  }
}
