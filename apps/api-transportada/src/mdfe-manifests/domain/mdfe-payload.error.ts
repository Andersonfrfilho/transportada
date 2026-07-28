/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class MdfePayloadEmptySelectionError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_PAYLOAD_EMPTY_SELECTION',
      message: 'A MDF-e requires at least one manifested CT-e.',
      status: 422,
    })
  }
}

export class MdfePayloadMissingLoadingCityError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_PAYLOAD_MISSING_LOADING_CITY',
      message: 'A MDF-e requires at least one loading municipality.',
      status: 422,
    })
  }
}

export class MdfePayloadMissingDriverError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_PAYLOAD_MISSING_DRIVER',
      message: 'The traction vehicle requires at least one driver.',
      status: 422,
    })
  }
}

export class MdfePayloadMissingWheelTypeError extends ApiError {
  public constructor(plate: string) {
    super({
      code: 'MDFE_PAYLOAD_MISSING_WHEEL_TYPE',
      message: `The traction vehicle ${plate} has no wheel type to send as tpRod.`,
      status: 422,
    })
  }
}

export class MdfePayloadMissingOwnerError extends ApiError {
  public constructor(plate: string) {
    super({
      code: 'MDFE_PAYLOAD_MISSING_OWNER',
      message: `The vehicle ${plate} is not owned by the company and has no owner to declare.`,
      status: 422,
    })
  }
}

export class MdfePayloadMissingRntrcError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_PAYLOAD_MISSING_RNTRC',
      message: 'A hired carrier requires the RNTRC in the road modal.',
      status: 422,
    })
  }
}

export class MdfePayloadTotalsMismatchError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_PAYLOAD_TOTALS_MISMATCH',
      message: 'The frozen manifest totals do not match the manifested CT-es.',
      status: 422,
    })
  }
}
