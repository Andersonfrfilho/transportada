/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class MdfeIssuancePayloadSourceMissingError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_ISSUANCE_PAYLOAD_SOURCE_MISSING',
      message: 'The manifest has no vehicle, driver or CT-e data to assemble the MDF-e payload.',
      status: 422,
    })
  }
}

export class MdfeIssuanceEmitterIncompleteError extends ApiError {
  public constructor(field: string) {
    super({
      code: 'MDFE_ISSUANCE_EMITTER_INCOMPLETE',
      message: `The company fiscal profile is missing the required field ${field}.`,
      status: 422,
    })
  }
}

export class MdfeIssuanceInvalidFiscalNumberError extends ApiError {
  public constructor(fiscalNumber: string) {
    super({
      code: 'MDFE_ISSUANCE_INVALID_FISCAL_NUMBER',
      message: `The reserved fiscal number ${fiscalNumber} is not a positive integer.`,
      status: 422,
    })
  }
}
