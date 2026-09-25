/* Copyright (c) 2026 Ada Technology. MIT License. */
/* Cópia por valor de apps/frontend-driver/src/modules/driver-trip/shared/pendingQueue.service.ts (ADR-0075 §7). */
import { isAttachmentDiscardable, type AttachmentGroupEntries } from './offlineAttachments.service'
import type { QueuedReport } from './offlineQueue.service'

/**
 * A pendência da fila antiga (ADR-0075 §6, plan D6): a mesma definição da app do motorista, copiada
 * no sentido inverso — o contrato `pending-queue` compara as duas pelo texto. O painel usa `total`
 * para decidir se o motorista já pode ir para a casa nova.
 *
 * A fila daqui não tem dono (`subHash`), então o filtro de `ownerSubHash` da app não vem, e o
 * contrato compara sem ele. Os gatilhos da drenagem também não: a tela de pendências drena pela
 * mesma porta de sempre (`useDriverTrip`).
 */
export type PendingCounts = Readonly<{ drainable: number; rejected: number; total: number }>

export function countPending(input: {
  readonly attachments: AttachmentGroupEntries
  readonly now: Date
  readonly reports: readonly QueuedReport[]
}): PendingCounts {
  let drainable = 0
  let rejected = 0

  for (const report of input.reports) {
    if (report.rejectionCause === undefined) drainable += 1
    else rejected += 1
  }

  for (const [, items] of input.attachments) {
    for (const attachment of items) {
      if (attachment.rejectionCause !== undefined) {
        rejected += 1
        continue
      }
      if (isAttachmentDiscardable({ attachment, now: input.now })) continue
      drainable += 1
    }
  }

  return { drainable, rejected, total: drainable + rejected }
}
