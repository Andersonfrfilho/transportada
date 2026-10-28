/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** Spec 281: envelope ilegível ou chave trocada — uma resposta só, o motivo real vai para o log. */
export class WhatsAppEvolutionUnavailableError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_EVOLUTION_UNAVAILABLE',
      message: 'The WhatsApp (Evolution) settings are not available',
      status: 503,
    })
  }
}

/** Empresa sem configuração do Evolution: para a leitura é `null`; para QR e estado é este erro. */
export class WhatsAppEvolutionNotConfiguredError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_EVOLUTION_NOT_CONFIGURED',
      message: 'WhatsApp (Evolution) is not configured for this company',
      status: 404,
    })
  }
}

export class WhatsAppEvolutionApiKeyRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_EVOLUTION_API_KEY_REQUIRED',
      details: [{ field: 'apiKey', message: 'required for a new configuration' }],
      message: 'A new WhatsApp (Evolution) configuration requires the instance key',
      status: 422,
    })
  }
}

/** RF7: ligar exige o aviso de risco (R1) confirmado. */
export class WhatsAppEvolutionRiskNotAcknowledgedError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_EVOLUTION_RISK_NOT_ACKNOWLEDGED',
      details: [{ field: 'acknowledgeRisk', message: 'must be true to enable' }],
      message: 'The risk notice must be acknowledged before enabling WhatsApp (Evolution)',
      status: 422,
    })
  }
}

export class WhatsAppEvolutionProviderNotEnabledError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_EVOLUTION_PROVIDER_NOT_ENABLED',
      details: [{ field: 'defaultProvider', message: 'requires status active' }],
      message: 'Evolution can only be the default provider while it is enabled',
      status: 422,
    })
  }
}

export class WhatsAppEvolutionBaseUrlRejectedError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_EVOLUTION_BASE_URL_REJECTED',
      details: [{ field: 'baseUrl', message: 'must be a public https origin' }],
      message: 'The Evolution address was rejected',
      status: 422,
    })
  }
}

/** O Evolution não respondeu (rede, chave recusada, instância inexistente): erro tipado, sem corpo do provedor. */
export class WhatsAppEvolutionUnreachableError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_EVOLUTION_UNREACHABLE',
      message: 'The Evolution instance did not answer',
      status: 502,
    })
  }
}

export class WhatsAppEvolutionDisabledError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_EVOLUTION_DISABLED',
      message: 'WhatsApp (Evolution) is disabled for this company',
      status: 409,
    })
  }
}

/**
 * Spec 281 T6: sem `API_PUBLIC_URL` a API não sabe o próprio endereço público, e apontar o webhook
 * do Evolution para um endereço adivinhado (o `Host` atrás do proxy) faria as mensagens sumirem.
 */
export class WhatsAppEvolutionWebhookUrlMissingError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_EVOLUTION_WEBHOOK_URL_MISSING',
      message: 'The public API address is not configured, so the Evolution webhook cannot be set',
      status: 503,
    })
  }
}
