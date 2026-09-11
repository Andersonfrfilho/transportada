/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * O número verificado é credencial e é de uma pessoa só na instalação. Como no login já usado, a
 * mensagem não diz de quem é o número — isso enumeraria usuários.
 */
export class WhatsAppPhoneTakenError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_PHONE_TAKEN',
      message: 'WhatsApp phone is already taken.',
      status: 409,
    })
    this.name = 'WhatsAppPhoneTakenError'
  }
}
