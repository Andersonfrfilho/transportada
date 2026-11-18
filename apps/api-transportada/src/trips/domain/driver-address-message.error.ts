/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 343 (T6a): o escritório manda o endereço correto ao motorista. Erros do envio ao grupo de WhatsApp dele.
 */
import { ApiError } from '../../shared/api.error.js'

/** O motorista da viagem não tem grupo de WhatsApp vinculado na ficha (spec 292). */
export class DriverAddressWhatsAppGroupMissingError extends ApiError {
  public constructor() {
    super({
      code: 'DRIVER_WHATSAPP_GROUP_MISSING',
      message: 'The driver of this trip has no WhatsApp group linked.',
      status: 422,
    })
  }
}

/** O Evolution não levou a mensagem; `reason` é o motivo fechado, nunca o grupo nem o texto. */
export class DriverAddressWhatsAppFailedError extends ApiError {
  public constructor(reason: 'disconnected' | 'failed' | 'number_not_found') {
    super({
      code: 'DRIVER_ADDRESS_WHATSAPP_FAILED',
      extraBody: { reason },
      message: 'The correct address could not be sent through WhatsApp.',
      status: reason === 'failed' ? 502 : 409,
    })
  }
}
