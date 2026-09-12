/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** Teto por número no despachante (plan § Segurança). Não é o rate limit global da API. */
export const WHATSAPP_COMMAND_RATE_LIMIT = { maxRequests: 30, windowMs: 10 * MINUTE_MS } as const

/** A resposta neutra sai uma vez por janela de 24h da Meta: repetir a recusa é ruído, não aviso. */
export const WHATSAPP_DENIED_REPLY_LIMIT = { maxRequests: 1, windowMs: 24 * HOUR_MS } as const

/** D1: uma resposta só para as quatro recusas e para a falta de permissão. A razão fica no log. */
export const WHATSAPP_DENIED_REPLY = 'Este número não está habilitado. Fale com o administrador.'

export const WHATSAPP_HANDOFF_REPLY = '🙋 Vou chamar uma pessoa.'

export const WHATSAPP_PHONE_VERIFIED_REPLY = '✅ Número verificado.'

export const WHATSAPP_DEFAULT_FALLBACK_REPLY = 'Não entendi. Toque numa das opções.'

export const WHATSAPP_DEFAULT_PROMPT = 'Escolha uma opção.'

export const WHATSAPP_LIST_BUTTON_LABEL = 'Ver opções'

export const WHATSAPP_BUTTON_OPTION_LIMIT = 3

export const WHATSAPP_LIST_OPTION_LIMIT = 10

export const WHATSAPP_INVALID_ATTEMPTS_CONTEXT_KEY = 'whatsappInvalidAttempts'

export const WHATSAPP_INVALID_ATTEMPTS_BEFORE_HANDOFF = 2

/** Salto entre fluxos por mensagem; acima disto o grafo tem ciclo de `flow:` e a conversa para. */
export const WHATSAPP_MAX_CROSS_FLOW_HOPS = 5

export const WHATSAPP_COMMAND_LOG = {
  denied: 'whatsapp.command.denied',
  failed: 'whatsapp.command.failed',
  flowAborted: 'whatsapp.command.flow_aborted',
  flowMissing: 'whatsapp.command.flow_missing',
  handoff: 'whatsapp.command.handoff',
  phoneVerificationRejected: 'whatsapp.phone.verification_rejected',
  phoneVerified: 'whatsapp.phone.verified',
} as const
