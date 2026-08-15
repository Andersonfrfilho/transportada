/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const NOTIFICATION_SCHEDULES_JOB = 'notification.schedules.run'

/**
 * ⚠️ Cópia por valor de `api-transportada/src/notification/notification.constant.ts`. A API publica,
 * o worker consome e este job reenfileira o que venceu — os três precisam nomear a mesma trilha, e
 * nenhuma app importa código da outra.
 */
export const NOTIFICATION_QUEUE_ROUTE = 'notification.v1'
export const NOTIFICATION_QUEUE_PREFETCH = 1

export const NOTIFICATION_DEFAULT_LOCALE = 'pt-BR'
export const NOTIFICATION_DEFAULT_TIMEZONE = 'America/Sao_Paulo'

/**
 * ⚠️ Cópia por valor do catálogo da API (`notification/domain/notification-catalog.constant.ts`),
 * só a parte que este processo dispara. Mudou a chave ou os marcadores lá? mude aqui —
 * `test/notification-schedules/triggers.contract.ts` guarda o casamento entre marcador e carga.
 */
export const NOTIFICATION_CATEGORY = {
  BILLING: 'billing',
  NFSE: 'nfse',
} as const

export const NOTIFICATION_TEMPLATE_KEY = {
  BILLING_INVOICE_DUE: 'billing.invoice-due',
  NFSE_INVOICE_REJECTED: 'nfse.invoice-rejected',
} as const

export const NOTIFICATION_TEMPLATE_PLACEHOLDERS = {
  'billing.invoice-due': ['dueDate', 'invoiceNumber'],
  'nfse.invoice-rejected': ['invoiceNumber', 'rejectionReason'],
} as const

/** Quantos dias antes do vencimento a fatura vira aviso. */
export const BILLING_INVOICE_DUE_WINDOW_DAYS = 3
