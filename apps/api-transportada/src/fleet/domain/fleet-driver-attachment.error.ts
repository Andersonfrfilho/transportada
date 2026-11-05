/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** Formato errado, tamanho estourado, corpo vazio ou nome que mente sobre o arquivo: uma só resposta. */
export class FleetDriverAttachmentInvalidUploadError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_ATTACHMENT_INVALID_UPLOAD',
      message: 'Invalid driver attachment upload',
      status: 400,
    })
  }
}

export class FleetDriverAttachmentNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_ATTACHMENT_NOT_FOUND',
      message: 'Driver attachment not found',
      status: 404,
    })
  }
}

/** Dois envios do mesmo tipo ao mesmo tempo: o índice único decide, e o perdedor recebe isto. */
export class FleetDriverAttachmentTypeTakenError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_ATTACHMENT_TYPE_TAKEN',
      message: 'This driver already has a document of this type',
      status: 409,
    })
  }
}

/** A sugestão da leitura já foi decidida: decidir de novo não reabre o que foi descartado. */
export class FleetDriverAttachmentSuggestionDecidedError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_ATTACHMENT_SUGGESTION_DECIDED',
      message: 'The suggestion for this document was already decided',
      status: 409,
    })
  }
}
