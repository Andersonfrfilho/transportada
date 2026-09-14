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

export class WhatsAppPhoneInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_PHONE_INVALID',
      message: 'WhatsApp phone is invalid.',
      status: 400,
    })
    this.name = 'WhatsAppPhoneInvalidError'
  }
}

/** Sem número para onde mandar, o código não teria uso: o painel orienta a configurar o canal. */
export class WhatsAppChannelNumberMissingError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_CHANNEL_NUMBER_MISSING',
      message: 'The company WhatsApp channel has no display phone number.',
      status: 409,
    })
    this.name = 'WhatsAppChannelNumberMissingError'
  }
}
