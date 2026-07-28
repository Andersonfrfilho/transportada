/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class CtePayloadEmptySelectionError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_PAYLOAD_EMPTY_SELECTION',
      message: 'A CT-e requires at least one linked NF-e.',
      status: 422,
    })
  }
}

export class CtePayloadInconsistentPartiesError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_PAYLOAD_INCONSISTENT_PARTIES',
      message: 'Every NF-e in the same CT-e must share the sender and the recipient.',
      status: 422,
    })
  }
}

export class CtePayloadUnsupportedModalError extends ApiError {
  public constructor(modal: string) {
    super({
      code: 'CTE_PAYLOAD_UNSUPPORTED_MODAL',
      message: `The modal ${modal} is not supported by the issuance provider.`,
      status: 422,
    })
  }
}

export class CtePayloadUnsupportedIcmsError extends ApiError {
  public constructor(cst: string) {
    super({
      code: 'CTE_PAYLOAD_UNSUPPORTED_ICMS',
      message: `The ICMS CST ${cst} is not supported by the issuance provider.`,
      status: 422,
    })
  }
}

export class CtePayloadUnresolvedPredominantProductError extends ApiError {
  public constructor(mode: string) {
    super({
      code: 'CTE_PAYLOAD_UNRESOLVED_PREDOMINANT_PRODUCT',
      message: `The predominant product could not be resolved with the mode ${mode}.`,
      status: 422,
    })
  }
}

export class CtePayloadUnsupportedTakerError extends ApiError {
  public constructor(taker: string) {
    super({
      code: 'CTE_PAYLOAD_UNSUPPORTED_TAKER',
      message: `The taker ${taker} requires an expedidor or recebedor, which the CT-e payload does not carry.`,
      status: 422,
    })
  }
}

export class CtePayloadReceiverIeUnavailableError extends ApiError {
  public constructor() {
    super({
      code: 'CTE_PAYLOAD_RECEIVER_IE_UNAVAILABLE',
      message:
        'The profile declares the taker as an ICMS taxpayer, but the taker has no state registration.',
      status: 422,
    })
  }
}

export class CtePayloadInvalidTaxIdError extends ApiError {
  public constructor(taxId: string) {
    super({
      code: 'CTE_PAYLOAD_INVALID_TAX_ID',
      message: `The tax id ${taxId} is neither a CPF nor a CNPJ.`,
      status: 422,
    })
  }
}
