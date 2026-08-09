/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class DacteDocumentNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'DACTE_DOCUMENT_NOT_FOUND',
      message: 'CT-e batch item was not found',
      status: 404,
    })
  }
}

/** Distinto do 404: o item existe, mas ainda não há documento autorizado para imprimir. */
export class DacteDocumentNotAuthorizedError extends ApiError {
  public constructor() {
    super({
      code: 'DACTE_DOCUMENT_NOT_AUTHORIZED',
      message: 'CT-e has no authorized document to print',
      status: 422,
    })
  }
}

/** A mensagem cita só o nome do elemento: conteúdo de XML fiscal nunca sai na resposta. */
export class DacteXmlInvalidError extends ApiError {
  public constructor(detail: string) {
    super({
      code: 'DACTE_XML_INVALID',
      message: `Authorized CT-e XML cannot be rendered as DACTE: ${detail}`,
      status: 422,
    })
  }
}
