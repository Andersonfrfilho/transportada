/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class CteEmissionProfileNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_PROFILE_NOT_FOUND',
      message: 'CT-e emission profile not found',
      status: 404,
    })
  }
}

export class CteEmissionProfileInactiveError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_PROFILE_INACTIVE',
      message: 'CT-e emission profile is not active',
      status: 409,
    })
  }
}

export class CteEmissionProfileAmbiguousError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_PROFILE_AMBIGUOUS',
      message: 'More than one CT-e emission profile matches the invoice with the same precedence',
      status: 409,
    })
  }
}

export class CteEmissionProfileUnresolvedError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_PROFILE_UNRESOLVED',
      message: 'No active CT-e emission profile matches the invoice',
      status: 422,
    })
  }
}

export class CteEmissionProfileInvalidTaxIdError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_PROFILE_INVALID_TAX_ID',
      message: 'Invoice party identifier must be a full CNPJ',
      status: 400,
    })
  }
}

export class CteEmissionProfileVersionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_PROFILE_VERSION_CONFLICT',
      message: 'CT-e emission profile was changed by another request',
      status: 409,
    })
  }
}

export class CteEmissionProfileNameTakenError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_PROFILE_NAME_TAKEN',
      message: 'Another CT-e emission profile already uses this name',
      status: 409,
    })
  }
}

export class CteEmissionProfileNotActivatableError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_PROFILE_NOT_ACTIVATABLE',
      message: 'An automatic CT-e emission profile needs at least one tax identifier matcher',
      status: 422,
    })
  }
}

export class CteChargeInvalidComponentError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_CHARGE_INVALID_COMPONENT',
      message: 'Charge component value does not match its calculation type',
      status: 422,
    })
  }
}

export class CteChargeRateOutOfRangeError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_CHARGE_RATE_OUT_OF_RANGE',
      message: 'Charge component rate must be a fraction between zero and one',
      status: 422,
    })
  }
}

export class CteChargeInvalidLabelError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_CHARGE_INVALID_LABEL',
      message: 'Charge component label must not be blank',
      status: 422,
    })
  }
}
