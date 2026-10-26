/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 RF9: o tipo da ocorrência não liga o envio ao cliente.
 */
import { ApiError } from '../../shared/api.error.js'

export class OccurrenceClientEmailOffError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CLIENT_EMAIL_OFF',
      message: 'This occurrence type does not send e-mail to the client.',
      status: 409,
    })
  }
}
