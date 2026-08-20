/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class FreightRegionNotFoundError extends ApiError {
  public constructor() {
    super({ code: 'FREIGHT_REGION_NOT_FOUND', message: 'Freight region not found', status: 404 })
  }
}

export class FreightRegionVersionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'FREIGHT_REGION_VERSION_CONFLICT',
      message: 'Freight region was changed by another request',
      status: 409,
    })
  }
}

/** O código impresso é a chave natural da importação: dois cadastros com ele desfazem a chave. */
export class FreightRegionCodeTakenError extends ApiError {
  public constructor() {
    super({
      code: 'FREIGHT_REGION_CODE_TAKEN',
      message: 'Another region of this company already uses the route code',
      status: 409,
    })
  }
}

export class FreightRegionUnknownError extends ApiError {
  public constructor() {
    super({
      code: 'FREIGHT_REGION_UNKNOWN',
      message: 'Region does not belong to this company',
      status: 422,
    })
  }
}
