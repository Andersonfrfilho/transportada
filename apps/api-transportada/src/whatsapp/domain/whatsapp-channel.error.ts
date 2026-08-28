/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * Spec 062: **uma resposta para envelope ilegível e para chave trocada.** Distinguir "o segredo não
 * abre" de "o segredo não existe" contaria, a quem tem acesso à API, se aquela empresa tem canal
 * cadastrado — e o motivo real (chaveiro fora do ar, AAD que não casa) fica no log, não na resposta.
 */
export class WhatsAppChannelUnavailableError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_CHANNEL_UNAVAILABLE',
      message: 'The WhatsApp channel is not available',
      status: 503,
    })
  }
}

/** Empresa sem canal cadastrado. É ausência, não defeito: nem toda instalação usa WhatsApp. */
export class WhatsAppChannelNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_CHANNEL_NOT_FOUND',
      message: 'WhatsApp channel was not found',
      status: 404,
    })
  }
}

/**
 * Cadastro novo sem token: gravar assim deixaria a tela dizendo "configurado" para um canal que
 * falha no primeiro envio. Atualização sem token é outra coisa — mantém o que já está selado.
 */
export class WhatsAppChannelTokenRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'WHATSAPP_CHANNEL_TOKEN_REQUIRED',
      details: [{ field: 'accessToken', message: 'required for a new channel' }],
      message: 'A new WhatsApp channel requires the access token',
      status: 422,
    })
  }
}
