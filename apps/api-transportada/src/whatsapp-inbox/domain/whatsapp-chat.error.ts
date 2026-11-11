/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class WhatsAppChatNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_CHAT_NOT_FOUND',
      message: 'The WhatsApp chat does not exist in this company.',
      status: 404,
    })
  }
}

/** Caso extremo da spec 319: o segundo atendente recebe quem já segura o chat e até quando. */
export class WhatsAppChatAlreadyTakenOverError extends ApiError {
  public constructor(holder: { readonly expiresAt: Date; readonly userId: string }) {
    super({
      code: 'WHATSAPP_CHAT_ALREADY_TAKEN_OVER',
      extraBody: {
        takenOver: { expiresAt: holder.expiresAt.toISOString(), userId: holder.userId },
      },
      message: 'Another attendant is already handling this WhatsApp chat.',
      status: 409,
    })
  }
}

/** O JID não entra na caixa (`@lid`, broadcast, forma desconhecida). */
export class WhatsAppChatJidInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_CHAT_JID_INVALID',
      message: 'The WhatsApp chat identifier is not a group or a phone number.',
      status: 400,
    })
  }
}
