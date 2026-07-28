/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class CteRetryPolicyInvalidError extends ApiError {
  public constructor(reason: string) {
    super({
      code: 'CTE_RETRY_POLICY_INVALID',
      message: `CT-e retry policy is invalid: ${reason}`,
      status: 422,
    })
  }
}
