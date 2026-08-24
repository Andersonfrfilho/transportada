/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `api-transportada/src/notification/notification.constant.ts`: a API publica
 * e o worker consome, e as duas apps não importam código uma da outra. Mudou a rota lá? mude aqui —
 * `test/notification/queue-topology.contract.ts` guarda o nome resultante.
 */

/** A rota da fila, sem o prefixo do ambiente. */
export const NOTIFICATION_QUEUE_ROUTE = 'notification.v1'

/** Uma entrega por vez: o gargalo é o provedor de e-mail, não o consumo da fila. */
export const NOTIFICATION_QUEUE_PREFETCH = 1

/** Mesmos padrões da API: quem escreve o texto é o catálogo, não o consumidor. */
export const NOTIFICATION_DEFAULT_LOCALE = 'pt-BR'
export const NOTIFICATION_DEFAULT_TIMEZONE = 'America/Sao_Paulo'

/**
 * ⚠️ Cópia por valor do catálogo da API (`notification/domain/notification-catalog.constant.ts`).
 * Só a parte que este worker dispara. Mudou a chave ou os marcadores lá? mude aqui —
 * `test/notification/triggers.contract.ts` guarda o casamento entre marcador e carga.
 */
export const NOTIFICATION_CATEGORY = {
  BILLING: 'billing',
  CTE_BATCH: 'cte-batch',
} as const

export const NOTIFICATION_TEMPLATE_KEY = {
  BILLING_INVOICE_DUE: 'billing.invoice-due',
  CTE_BATCH_ISSUANCE_FAILED: 'cte-batch.issuance-failed',
} as const

export const NOTIFICATION_TEMPLATE_PLACEHOLDERS = {
  'billing.invoice-due': ['dueDate', 'invoiceNumber'],
  'cte-batch.issuance-failed': ['batchName', 'failedCount'],
} as const
