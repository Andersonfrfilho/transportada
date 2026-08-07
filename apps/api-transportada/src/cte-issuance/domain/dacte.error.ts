/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

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
