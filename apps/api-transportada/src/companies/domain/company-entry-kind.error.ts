/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** Spec 169 RF1 / CA06: nome repetido no mesmo lado é recusado com código estável. */
export class CompanyEntryKindNameConflictError extends ApiError {
  public constructor() {
    super({
      code: 'COMPANY_ENTRY_KIND_NAME_CONFLICT',
      message: 'An entry kind with this name already exists for this side.',
      status: 409,
    })
  }
}

export class CompanyEntryKindNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'COMPANY_ENTRY_KIND_NOT_FOUND',
      message: 'The entry kind is not registered in this company.',
      status: 404,
    })
  }
}
