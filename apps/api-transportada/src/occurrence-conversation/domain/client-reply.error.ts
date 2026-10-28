/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 283 T5 (D6): os erros próprios da resposta do painel ao cliente. Ficam fora dos erros do boleto por WhatsApp
 * (281), que a tela do envio traduz um a um.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * Spec 283 T5 (D6): o primeiro envio do painel a um número pede confirmação. Nada sai; o número vai só mascarado, no
 * `message` do detalhe de `confirmNumber`, para a tela mostrar na pergunta.
 */
export class ClientReplyConfirmationRequiredError extends ApiError {
  public constructor(numberMasked: string) {
    super({
      code: 'OCCURRENCE_CLIENT_REPLY_CONFIRMATION_REQUIRED',
      details: [{ field: 'confirmNumber', message: numberMasked }],
      message: 'Confirm the number before the first reply to it',
      status: 409,
    })
  }
}
