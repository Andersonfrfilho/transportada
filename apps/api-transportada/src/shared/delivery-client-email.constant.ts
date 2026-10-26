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
