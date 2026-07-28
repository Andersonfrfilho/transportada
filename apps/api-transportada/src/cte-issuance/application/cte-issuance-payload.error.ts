/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class CteIssuancePayloadSourceMissingError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_ISSUANCE_PAYLOAD_SOURCE_MISSING',
      message: 'The batch item has no linked NF-e data to assemble the CT-e payload.',
      status: 422,
    })
  }
}

export class CteIssuanceEmitterIncompleteError extends ApiError {
  public constructor(field: string) {
    super({
      code: 'CTE_ISSUANCE_EMITTER_INCOMPLETE',
      message: `The company fiscal profile is missing the required field ${field}.`,
      status: 422,
    })
  }
}

export class CteIssuanceInvalidFiscalNumberError extends ApiError {
  public constructor(fiscalNumber: string) {
    super({
      code: 'CTE_ISSUANCE_INVALID_FISCAL_NUMBER',
      message: `The reserved fiscal number ${fiscalNumber} is not a positive integer.`,
      status: 422,
    })
  }
}
