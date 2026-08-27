/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class DamdfeDocumentNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'DAMDFE_DOCUMENT_NOT_FOUND',
      message: 'MDF-e manifest was not found',
      status: 404,
    })
  }
}

/** Distinto do 404: a viagem tem manifesto, mas nenhum autorizado para imprimir. */
export class DamdfeDocumentNotAuthorizedError extends ApiError {
  public constructor() {
    super({
      code: 'DAMDFE_DOCUMENT_NOT_AUTHORIZED',
      message: 'MDF-e has no authorized document to print',
      status: 422,
    })
  }
}

/** A mensagem cita só o nome do elemento: conteúdo de XML fiscal nunca sai na resposta. */
export class DamdfeXmlInvalidError extends ApiError {
  public constructor(detail: string) {
    super({
      code: 'DAMDFE_XML_INVALID',
      message: `Authorized MDF-e XML cannot be rendered as DAMDFE: ${detail}`,
      status: 422,
    })
  }
}
