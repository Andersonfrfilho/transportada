/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class ContractorAutomationNameConflictError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_AUTOMATION_NAME_CONFLICT',
      message: 'An automation with this name already exists in this company.',
      status: 409,
    })
  }
}

export class ContractorAutomationNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_AUTOMATION_NOT_FOUND',
      message: 'The automation is not registered in this company.',
      status: 404,
    })
  }
}
