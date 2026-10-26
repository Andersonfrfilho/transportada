/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do contrato da T4 (spec 279): o bundle não importa código da API. */
export const CLIENT_BOLETO_EMAILS_PATH = (occurrenceId: string): string =>
  `/me/trips/current/occurrences/${occurrenceId}/client-boleto-emails`

export type ClientBoletoEmailOption = Readonly<{
  addressMasked: string
  emailId: string
  label: string
}>

/** O que o `GET` devolve: só endereços mascarados, escolhidos por `emailId`. */
export type ClientBoletoEmailOptions = Readonly<{
  clientEmailType: string
  clientEmails: readonly ClientBoletoEmailOption[]
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
