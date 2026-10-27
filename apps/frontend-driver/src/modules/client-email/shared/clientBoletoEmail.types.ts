/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do contrato da T4 (spec 279): o bundle não importa código da API. */
export const CLIENT_BOLETO_EMAILS_PATH = (occurrenceId: string): string =>
  `/me/trips/current/occurrences/${occurrenceId}/client-boleto-emails`

export type ClientBoletoEmailOption = Readonly<{
  addressMasked: string
  emailId: string
  label: string
}>

/**
 * Spec 279 T6b (RF12): o estado do envio por endereço. `skipped` (sem endereço) é o envio automático que não achou
 * e-mail do cliente (T3c).
 */
export type ClientBoletoEmailDelivery = Readonly<{
  address: null | string
  id: string
  sentAt: null | string
  status: 'failed' | 'queued' | 'sent' | 'skipped'
}>

export const CLIENT_BOLETO_EMAIL_DELIVERY_STATUSES = [
  'failed',
  'queued',
  'sent',
  'skipped',
] as const

/** O que o `GET` devolve: endereços mascarados, escolhidos por `emailId`, e o estado do que já foi enviado. */
export type ClientBoletoEmailOptions = Readonly<{
  clientEmailType: string
  clientEmails: readonly ClientBoletoEmailOption[]
  /** Resposta anterior à T6b não traz o campo: vira lista vazia. */
  deliveries: readonly ClientBoletoEmailDelivery[]
  sentCount: number
  sentLimit: number
}>

export const CLIENT_BOLETO_EMAIL_RESULT_KINDS = [
  'already_queued',
  'failed',
  'queued',
  'skipped',
] as const
export type ClientBoletoEmailResultKind = (typeof CLIENT_BOLETO_EMAIL_RESULT_KINDS)[number]

export type ClientBoletoEmailResult = Readonly<{
  addressMasked: string
  kind: ClientBoletoEmailResultKind
}>

export type ClientBoletoEmailOutcome = Readonly<{
  results: readonly ClientBoletoEmailResult[]
  savedEmailId: string | null
}>

/** O pedido de envio: ou ids já guardados, ou um endereço novo (com `save` para guardar). */
export type ClientBoletoEmailSendRequest = Readonly<{
  emailIds?: readonly string[] | undefined
  idempotencyKey: string
  newAddress?: string | undefined
  occurrenceId: string
  save?: boolean | undefined
}>

/** O envio que espera rede: a `idempotencyKey` é a mesma de toda tentativa, então a fila não duplica. */
export type ClientBoletoEmailOutboxItem = Readonly<{
  attempts: number
  createdAt: string
  lastAttemptAt?: string | undefined
  ownerKey: string
  request: ClientBoletoEmailSendRequest
  state: 'failed' | 'queued'
}>

export type ClientBoletoEmailOutboxStore = Readonly<{
  put: (item: ClientBoletoEmailOutboxItem) => Promise<void>
  readAll: () => Promise<readonly ClientBoletoEmailOutboxItem[]>
  remove: (idempotencyKey: string) => Promise<void>
}>
