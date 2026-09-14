/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — quando a rotina chama a API para liquidar ou retomar um pedido de WhatsApp.
 *
 * ⚠️ Cópia por valor de `api-transportada/src/whatsapp-commands/domain/`, com o mesmo corpo abaixo
 * da marca: aqui o veredito é só a dica de quando chamar, e a API recalcula antes de faturar. A
 * paridade é conferida linha a linha em `test/whatsapp-command-settlement/policy-parity.contract.ts`.
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
