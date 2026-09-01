/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  CTE_BATCH_BLOCK_REASON,
  type CteBatchBlockReason,
  type EligibilityDocument,
  checkSharedEligibility,
} from '../../cte-batches/domain/cte-batch-eligibility.policy.js'

export type ResolveNfseDocumentBlockParams = {
  readonly document: EligibilityDocument
  readonly linkedBatchId: string | null
  readonly linkedNfseInvoiceId: string | null
}

/**
 * O bloqueio da NFS-e é **diferente** do bloqueio do CT-e, e por um motivo só: o RPS não declara
 * massa, então o peso que barra a CT-e não barra o serviço (spec 067).
 *
 * Isto existe separado de `resolveDocumentBlock` porque a tabela de Notas decide com um booleano se
 * a linha pode ser marcada. Enquanto esse booleano vinha do motivo do CT-e, a nota sem peso era
 * impossível de selecionar para qualquer coisa — inclusive para a NFS-e que a API já aceitava.
 */
export function resolveNfseDocumentBlock({
  document,
  linkedBatchId,
  linkedNfseInvoiceId,
}: ResolveNfseDocumentBlockParams): CteBatchBlockReason | null {
  const eligibility = checkSharedEligibility(document)
  if (eligibility.reason !== undefined) return eligibility.reason
  // Emitir os dois para o mesmo transporte é bitributação — vale nos dois sentidos.
  if (linkedBatchId !== null) return CTE_BATCH_BLOCK_REASON.alreadyLinked
  if (linkedNfseInvoiceId !== null) return CTE_BATCH_BLOCK_REASON.linkedToNfse

  return null
}
