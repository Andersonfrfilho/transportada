/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5d: os recusos de "Descartar" o alerta de canhoto de outra nota. Códigos e ids, nunca
 * número de nota, série ou texto lido.
 */
import { ApiError } from '../../shared/api.error.js'

/** Só a foto ainda pendente tem alerta: com veredito de gente (ou do código de barras) não há o que descartar. */
export class CanhotoDismissNotPendingError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_DISMISS_NOT_PENDING',
      message: 'Only a pending canhoto has a mismatch alert to dismiss.',
      status: 409,
    })
  }
}

/** Sem alerta derivado não há o que descartar: descartar não é "marcar como visto" qualquer foto. */
export class CanhotoDismissNotFlaggedError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_DISMISS_NOT_FLAGGED',
      message: 'This canhoto has no mismatch alert to dismiss.',
      status: 409,
    })
  }
}
