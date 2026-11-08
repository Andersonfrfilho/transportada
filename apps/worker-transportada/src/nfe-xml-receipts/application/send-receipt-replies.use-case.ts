/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: o resumo a quem mandou o XML — recusa (com o motivo), falha definitiva, ou o resultado da importação depois
 * que ela termina. Roda em lotes e uma vez por recibo (`summary_sent_at`). Falhar em enviar não perde o resumo: o
 * recibo fica sem a marca e sai no ciclo seguinte; só o envio bem-sucedido o marca.
 */
import { NFE_XML_RECEIPT_LIMITS, NFE_XML_RECEIPT_LOG } from '../domain/nfe-xml-receipt.constant.js'
import {
  buildEmailReport,
  buildFailure,
  buildSummary,
  describeRejection,
} from '../domain/receipt-messages.policy.js'
import type {
  ReceiptLogger,
  ReceiptReplyPort,
  ReceiptSummaryRepositoryPort,
  ReceiptSummaryRow,
} from './nfe-xml-receipt.types.js'

export type SendReceiptRepliesDependencies = {
  readonly logger: ReceiptLogger
  readonly now: () => Date
  readonly reply: ReceiptReplyPort
  readonly repository: ReceiptSummaryRepositoryPort
}

export function textForReceipt(row: ReceiptSummaryRow): string {
  if (row.status === 'rejected') {
    return describeRejection(row.rejectReason ?? 'no_accepted_file')
  }
  if (row.status === 'failed' || row.counts === null) return buildFailure()
  return buildSummary({ counts: row.counts, problems: row.problems })
}

/** Só o e-mail de uma importação concluída leva o relatório detalhado; recusa e falha seguem curtos. */
export function emailForReceipt(
  row: ReceiptSummaryRow,
): { readonly body: string; readonly subject: string } | undefined {
  if (row.channel !== 'email' || row.status !== 'imported') return undefined
  if (row.counts === null || row.report === undefined || row.report === null) return undefined
  return buildEmailReport({ counts: row.counts, report: row.report })
}

export async function sendReceiptReplies(
  dependencies: SendReceiptRepliesDependencies,
): Promise<{ readonly failed: number; readonly sent: number }> {
  const rows = await dependencies.repository.findSummariesToSend({
    limit: NFE_XML_RECEIPT_LIMITS.summaryBatchSize,
    maxAttempts: NFE_XML_RECEIPT_LIMITS.summaryMaxAttempts,
  })
  let sent = 0
  let failed = 0
  for (const row of rows) {
    try {
      const email = emailForReceipt(row)
      await dependencies.reply.send({
        channel: row.channel,
        companyId: row.companyId,
        ...(email === undefined ? {} : { email }),
        replyTo: row.replyTo,
        sender: row.sender,
        text: textForReceipt(row),
      })
      await dependencies.repository.markSummarySent({
        now: dependencies.now(),
        receiptId: row.id,
      })
      sent += 1
      dependencies.logger.info(NFE_XML_RECEIPT_LOG.summarySent, {
        channel: row.channel,
        companyId: row.companyId,
        receiptId: row.id,
        status: row.status,
      })
    } catch (error: unknown) {
      failed += 1
      await dependencies.repository.markSummaryAttempt({ receiptId: row.id }).catch(() => undefined)
      dependencies.logger.warn(NFE_XML_RECEIPT_LOG.summarySent, {
        channel: row.channel,
        companyId: row.companyId,
        errorName: error instanceof Error ? error.name : typeof error,
        receiptId: row.id,
        sent: false,
      })
    }
  }
  return { failed, sent }
}
