/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor das rotas do motorista da T5 (spec 281): o bundle não importa código da API. */
export const CLIENT_BOLETO_WHATSAPP_PATH = (occurrenceId: string): string =>
  `/me/trips/current/occurrences/${occurrenceId}/client-boleto-whatsapp`

export const CLIENT_BOLETO_WHATSAPP_RESEND_PATH = (
  occurrenceId: string,
  deliveryId: string,
): string => `${CLIENT_BOLETO_WHATSAPP_PATH(occurrenceId)}/deliveries/${deliveryId}/resend`

export type ClientBoletoWhatsAppContact = Readonly<{
  contactId: string
  label: string
  numberMasked: string
}>

/** Por que uma entrega não saiu (`ContractorReplyDeliveryReason` da API, só os que o WhatsApp usa). */
export const CLIENT_BOLETO_WHATSAPP_FAILURE_REASONS = [
  'attachment_too_large_for_whatsapp',
  'send_failed',
  'whatsapp_disconnected',
  'whatsapp_number_not_found',
] as const
export type ClientBoletoWhatsAppFailureReason =
  (typeof CLIENT_BOLETO_WHATSAPP_FAILURE_REASONS)[number]

/** Estados da entrega no trilho da 248/279 (`ContractorReplyDeliveryStatus`). */
export const CLIENT_BOLETO_WHATSAPP_DELIVERY_STATUSES = ['failed', 'queued', 'sent'] as const
export type ClientBoletoWhatsAppDeliveryStatus =
  (typeof CLIENT_BOLETO_WHATSAPP_DELIVERY_STATUSES)[number]

export type ClientBoletoWhatsAppDelivery = Readonly<{
  createdAt: string
  id: string
  numberMasked: null | string
  reason: ClientBoletoWhatsAppFailureReason | null
  sentAt: null | string
  status: ClientBoletoWhatsAppDeliveryStatus
}>

/** O que o `GET` devolve: números mascarados, escolhidos por `contactId`, o estado do Evolution e o que já saiu. */
export type ClientBoletoWhatsAppOptions = Readonly<{
  clientChannel: string
  contacts: readonly ClientBoletoWhatsAppContact[]
  deliveries: readonly ClientBoletoWhatsAppDelivery[]
  /** `ready` só com o número da empresa conectado; senão o botão fica fora e o e-mail segue. */
  evolutionReady: boolean
  sentCount: number
  sentLimit: number
}>

export const CLIENT_BOLETO_WHATSAPP_RESULT_KINDS = [
  'already_sent',
  'failed',
  'in_progress',
  'sent',
] as const
export type ClientBoletoWhatsAppResultKind = (typeof CLIENT_BOLETO_WHATSAPP_RESULT_KINDS)[number]

export type ClientBoletoWhatsAppResult = Readonly<{
  deliveryId: string
  kind: ClientBoletoWhatsAppResultKind
  numberMasked: string
  reason: ClientBoletoWhatsAppFailureReason | null
}>

export type ClientBoletoWhatsAppOutcome = Readonly<{
  results: readonly ClientBoletoWhatsAppResult[]
  savedContactId: null | string
}>

/**
 * O pedido de envio: ou ids já guardados, ou um número novo (com `save` para guardar). O número digitado só
 * chega aqui depois da tela de confirmação.
 */
export type ClientBoletoWhatsAppSendRequest = Readonly<{
  contactIds?: readonly string[] | undefined
  idempotencyKey: string
  number?: string | undefined
  occurrenceId: string
  save?: boolean | undefined
}>

/** O envio que espera rede: a `idempotencyKey` é a mesma de toda tentativa, então a fila não duplica. */
export type ClientBoletoWhatsAppOutboxItem = Readonly<{
  attempts: number
  createdAt: string
  lastAttemptAt?: string | undefined
  ownerKey: string
  request: ClientBoletoWhatsAppSendRequest
  state: 'failed' | 'queued'
}>

export type ClientBoletoWhatsAppOutboxStore = Readonly<{
  put: (item: ClientBoletoWhatsAppOutboxItem) => Promise<void>
  readAll: () => Promise<readonly ClientBoletoWhatsAppOutboxItem[]>
  remove: (idempotencyKey: string) => Promise<void>
}>
