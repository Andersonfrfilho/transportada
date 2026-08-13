/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * A única recusa da confirmação. Pedido inexistente, expirado, já usado, com tentativas esgotadas
 * ou código errado chegam todos aqui — a mensagem não pode deixar deduzir qual dos casos foi, nem
 * confirmar que existe pedido para aquele login.
 */
export class PasswordResetCodeRejectedError extends ApiError {
  public constructor() {
    super({
      code: 'PASSWORD_RESET_CODE_REJECTED',
      message: 'Recovery code is invalid or no longer usable.',
      status: 400,
    })
    this.name = 'PasswordResetCodeRejectedError'
  }
}
