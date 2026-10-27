/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 D1: o vocabulário único dos tipos de e-mail do cliente de entrega — boleto, nota fiscal,
 * financeiro e geral. A CHECK do banco, a API e as telas leem daqui; nenhum outro lugar lista os tipos.
 */
export const DELIVERY_CLIENT_EMAIL_PURPOSE = {
  BOLETO: 'boleto',
  FINANCE: 'finance',
  GENERAL: 'general',
  INVOICE: 'invoice',
} as const

export const DELIVERY_CLIENT_EMAIL_PURPOSES = ['boleto', 'invoice', 'finance', 'general'] as const
export type DeliveryClientEmailPurpose = (typeof DELIVERY_CLIENT_EMAIL_PURPOSES)[number]

/** Quem guardou o endereço: o escritório (painel) ou o motorista (app). */
export const DELIVERY_CLIENT_EMAIL_AUTHOR_KINDS = ['office', 'driver'] as const
export type DeliveryClientEmailAuthorKind = (typeof DELIVERY_CLIENT_EMAIL_AUTHOR_KINDS)[number]

/** D2: o cadastro não vira lista de transmissão. Cobrado pela API (`422 DELIVERY_CLIENT_EMAIL_LIMIT_REACHED`). */
export const DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE = 10

/** Mesmo padrão e limite de `nfe_documents.recipient_email`: guarda de forma, não validação do endereço. */
export const DELIVERY_CLIENT_EMAIL_ADDRESS_PATTERN =
  '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'
export const DELIVERY_CLIENT_EMAIL_ADDRESS_MAX_LENGTH = 254
export const DELIVERY_CLIENT_EMAIL_LABEL_MAX_LENGTH = 60

/**
 * Spec 279 RF9: o que o tipo da ocorrência diz sobre o botão "Enviar ao cliente" — `off` (padrão, sem botão e a API
 * recusa com 409) ou o tipo de e-mail do cliente (D1) que o botão usa.
 */
export const CLIENT_EMAIL_TYPE_OFF = 'off'
export const CLIENT_EMAIL_TYPES = [
  CLIENT_EMAIL_TYPE_OFF,
  ...DELIVERY_CLIENT_EMAIL_PURPOSES,
] as const
export type ClientEmailType = (typeof CLIENT_EMAIL_TYPES)[number]
export const CLIENT_EMAIL_TYPE_DEFAULT: ClientEmailType = CLIENT_EMAIL_TYPE_OFF

/**
 * Spec 279 RF10: como o boleto aceito chega ao cliente. `manual` (padrão) só sai pelo botão; `automatic` sai sozinho, ao
 * aceitar o boleto, a todos os e-mails do tipo configurado no cadastro do cliente. Só vale com `client_email_type <> off`.
 */
export const CLIENT_EMAIL_SEND_MODES = ['manual', 'automatic'] as const
export type ClientEmailSendMode = (typeof CLIENT_EMAIL_SEND_MODES)[number]
export const CLIENT_EMAIL_SEND_MODE_DEFAULT: ClientEmailSendMode = 'manual'

/**
 * Spec 281 D12: os contatos do cliente moram numa tabela só (`delivery_client_contacts`), um canal por linha. As linhas
 * da 279 nasceram e-mail; o WhatsApp guarda o número em E.164 (`+5511987654321`), já normalizado pela API (D4).
 */
export const DELIVERY_CLIENT_CONTACT_CHANNEL = {
  EMAIL: 'email',
  WHATSAPP: 'whatsapp',
} as const
export const DELIVERY_CLIENT_CONTACT_CHANNELS = ['email', 'whatsapp'] as const
export type DeliveryClientContactChannel = (typeof DELIVERY_CLIENT_CONTACT_CHANNELS)[number]
export const DELIVERY_CLIENT_CONTACT_CHANNEL_DEFAULT: DeliveryClientContactChannel = 'email'

/** E.164: `+`, país sem zero à esquerda, até 15 dígitos no total. Guarda de forma; quem normaliza é a API. */
export const DELIVERY_CLIENT_WHATSAPP_ADDRESS_PATTERN = '^\\+[1-9][0-9]{7,14}$'

/**
 * Spec 281 D11 (RF8): por qual canal a ocorrência fala com o cliente — `off`, `email`, `whatsapp` ou `both`. O padrão é
 * `email` para não mudar nada no que a 279 já faz: quem liga e desliga o e-mail continua sendo o `client_email_type`.
 */
export const CLIENT_CHANNEL = {
  BOTH: 'both',
  EMAIL: 'email',
  OFF: 'off',
  WHATSAPP: 'whatsapp',
} as const
export const CLIENT_CHANNELS = ['off', 'email', 'whatsapp', 'both'] as const
export type ClientChannel = (typeof CLIENT_CHANNELS)[number]
export const CLIENT_CHANNEL_DEFAULT: ClientChannel = 'email'
