/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — o estado final de cada documento do pedido e a decisão sobre o pedido (D6.4).
 *
 * ⚠️ Cópia por valor em `worker-transportada/src/whatsapp-command-settlement/domain/`, com o mesmo
 * corpo abaixo da marca: o worker decide quando chamar e a API recalcula antes de faturar. A paridade
 * é conferida linha a linha em `worker-transportada/test/whatsapp-command-settlement/`.
 */
// ── corpo compartilhado ──

/** Sucesso é só `authorized`: é o único estado que fatura. */
const SUCCESS_STATUSES: ReadonlySet<string> = new Set(['authorized'])

/**
 * `cancelled` é falha aqui, ao contrário de `SUCCESSFUL_STATUSES` do progresso do lote: CT-e
 * cancelado não fatura. `reconciliation_required` fica de fora de propósito — é pendente.
 */
const FAILURE_STATUSES: ReadonlySet<string> = new Set([
  'rejected',
  'failed',
  'cancelled',
  'discarded',
])

/** Depois disso o pedido liquida com o que tem, e os pendentes saem nomeados no resumo. */
export const WHATSAPP_COMMAND_SETTLEMENT_TIMEOUT_MILLISECONDS = 7_200_000

/** Uma confirmação corre em segundos; parada há quinze minutos, o processo que a corria caiu. */
export const WHATSAPP_COMMAND_STUCK_CONFIRMING_MILLISECONDS = 900_000

export type WhatsAppCommandDocumentOutcome = 'failure' | 'pending' | 'success'

export type WhatsAppCommandSettlementVerdict = 'resume' | 'settle' | 'settle_partial' | 'wait'

/** Status que ninguém previu é pendente: nunca vira sucesso, então nunca fatura por engano. */
export function classifyWhatsAppCommandDocument(status: string): WhatsAppCommandDocumentOutcome {
  if (SUCCESS_STATUSES.has(status)) return 'success'
  if (FAILURE_STATUSES.has(status)) return 'failure'
  return 'pending'
}

export function decideWhatsAppCommandSettlement(input: {
  readonly confirmedAt: Date | undefined
  readonly documents: readonly WhatsAppCommandDocumentOutcome[]
  readonly now: Date
  readonly status: string
}): WhatsAppCommandSettlementVerdict {
  const elapsed =
    input.confirmedAt === undefined ? 0 : input.now.getTime() - input.confirmedAt.getTime()
  if (input.status === 'confirming') {
    return elapsed > WHATSAPP_COMMAND_STUCK_CONFIRMING_MILLISECONDS ? 'resume' : 'wait'
  }
  if (input.status !== 'dispatched') return 'wait'
  if (input.documents.every((document) => document !== 'pending')) return 'settle'
  return elapsed > WHATSAPP_COMMAND_SETTLEMENT_TIMEOUT_MILLISECONDS ? 'settle_partial' : 'wait'
}
