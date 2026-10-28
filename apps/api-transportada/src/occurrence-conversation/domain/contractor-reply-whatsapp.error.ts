/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T5 (RF5): os erros estáveis do envio do boleto por WhatsApp. Nenhum ecoa o número: o código diz o motivo.
 * Todo erro daqui significa "o WhatsApp não serve agora": a tela oferece o envio por e-mail (279) no lugar.
 */
import { ApiError } from '../../shared/api.error.js'

/** O tipo da ocorrência não liga o WhatsApp com o cliente (`client_channel` diferente de `whatsapp` e `both`). */
export class ContractorReplyWhatsAppOffError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CLIENT_WHATSAPP_OFF',
      message: 'Sending to the client by WhatsApp is off for this occurrence type',
      status: 409,
    })
  }
}

/** D4: vazio, com letras, sem DDD ou fora do E.164 — nada sai e nada é guardado. */
export class ContractorReplyWhatsAppNumberInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_NUMBER_INVALID',
      details: [{ field: 'number', message: 'Enter a phone number with area code' }],
      message: 'The number must be a valid WhatsApp number',
      status: 400,
    })
  }
}

/** Um `contactId` que não é WhatsApp do cliente desta nota (outro cliente, outra empresa, removido). */
export class ContractorReplyWhatsAppContactNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_CONTACT_NOT_FOUND',
      message: 'The WhatsApp number was not found for this client',
      status: 404,
    })
  }
}

export class ContractorReplyWhatsAppContactLimitReachedError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_CONTACT_LIMIT_REACHED',
      message: 'The client already has the maximum number of saved WhatsApp numbers',
      status: 422,
    })
  }
}

/** Teto por ocorrência (o mesmo número do e-mail) ou de tentativas por número. */
export class ContractorReplyWhatsAppLimitReachedError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_OCCURRENCE_LIMIT_REACHED',
      message: 'The limit of WhatsApp messages for this occurrence was reached',
      status: 409,
    })
  }
}

/** RF2/D9: o teto diário do número da empresa (`whatsapp_evolution_settings.daily_cap`). */
export class ContractorReplyWhatsAppDailyCapReachedError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_DAILY_CAP_REACHED',
      message: 'The daily limit of WhatsApp messages for this company was reached',
      status: 429,
    })
  }
}

/** "Tentar de novo" / "Reenviar" de uma entrega que não é do WhatsApp do cliente, ou que não terminou. */
export class ContractorReplyWhatsAppResendNotAllowedError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_RESEND_NOT_ALLOWED',
      message: 'This WhatsApp delivery cannot be sent again',
      status: 409,
    })
  }
}
