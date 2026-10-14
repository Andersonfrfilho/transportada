/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DeliveryProofProcessingErrorCode } from '../domain/delivery-proof-processing.constant.js'

export class DeliveryProofImageTimeoutError extends Error {
  constructor() {
    super('delivery proof image thread exceeded its budget')
    this.name = 'DeliveryProofImageTimeoutError'
  }
}

/**
 * Falha com código curto, o único texto que chega à coluna `processing_error` e ao log. Nunca
 * carrega mensagem de biblioteca, chave de objeto nem EXIF.
 */
export class DeliveryProofProcessingError extends Error {
  readonly code: DeliveryProofProcessingErrorCode

  constructor(code: DeliveryProofProcessingErrorCode) {
    super(code)
    this.name = 'DeliveryProofProcessingError'
    this.code = code
  }
}
