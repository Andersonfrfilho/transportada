/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * Uma única resposta pra formato errado, tamanho estourado ou corpo vazio — o cliente nunca
 * descobre qual regra específica falhou (mesmo espírito do `202` invariável da 053: recusa
 * client-side não vaza detalhe, ver spec 064, Casos extremos).
 */
export class AggregateDocumentInvalidUploadError extends ApiError {
  public constructor() {
    super({
      code: 'AGGREGATE_DOCUMENT_INVALID_UPLOAD',
      message: 'Invalid document upload',
      status: 400,
    })
  }
}

export class AggregateDocumentNotFoundError extends ApiError {
  public constructor() {
    super({ code: 'AGGREGATE_DOCUMENT_NOT_FOUND', message: 'Document not found', status: 404 })
  }
}

export class AggregateDocumentRejectionReasonRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'AGGREGATE_DOCUMENT_REJECTION_REASON_REQUIRED',
      message: 'A rejection requires a reason',
      status: 400,
    })
  }
}
