/** Copyright (c) 2026 Ada Technology. MIT License. */
import type { NfeImportDetail } from './nfe-import.types.js'

/**
 * Spec 314 RF1/RF6: recusas que uma mudança de regra ou de cadastro pode reverter. XML inválido,
 * modelo que não é NF-e e ambiente fiscal diferente ficam de fora: refazer devolveria a mesma recusa.
 */
export const REPROCESSABLE_REJECTION_CODES = ['NFE_IMPORT_UNRELATED_CNPJ'] as const

const BUSY_STATUSES: readonly string[] = ['pending', 'queued', 'processing']
const RETRY_STATUSES: readonly string[] = ['failed', 'partially_processed']

export type NfeImportReprocessPlan = {
  /** Itens `failed` que ganham nova tentativa (só em importação failed/partially_processed). */
  readonly failedItems: NfeImportDetail['items']
  /** Itens `rejected` por motivo reprocessável, relidos no lugar pelo consumidor. */
  readonly rejectedItems: NfeImportDetail['items']
  readonly busy: boolean
}

export function planNfeImportReprocess(detail: NfeImportDetail): NfeImportReprocessPlan {
  const busy = BUSY_STATUSES.includes(detail.status)
  const failedItems = RETRY_STATUSES.includes(detail.status)
    ? detail.items.filter((item) => item.status === 'failed')
    : []
  const rejectedItems = detail.items.filter(
    (item) =>
      item.status === 'rejected' &&
      item.error !== null &&
      (REPROCESSABLE_REJECTION_CODES as readonly string[]).includes(item.error.code),
  )
  return { busy, failedItems, rejectedItems }
}
