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
  mergeReports,
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
  return buildSummary({ counts: row.counts, problems: row.problems, report: row.report })
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
  for (const message of planMessages(rows)) {
    const [row] = message.rows
    if (row === undefined) continue
    try {
      await dependencies.reply.send({
        channel: row.channel,
        companyId: row.companyId,
        ...(message.email === undefined ? {} : { email: message.email }),
        replyTo: row.replyTo,
        sender: row.sender,
        text: message.text,
      })
      for (const done of message.rows) {
        await dependencies.repository.markSummarySent({
          now: dependencies.now(),
          receiptId: done.id,
        })
        sent += 1
        dependencies.logger.info(NFE_XML_RECEIPT_LOG.summarySent, {
          channel: done.channel,
          companyId: done.companyId,
          receiptId: done.id,
          status: done.status,
        })
      }
    } catch (error: unknown) {
      for (const lost of message.rows) {
        failed += 1
        await dependencies.repository
          .markSummaryAttempt({ receiptId: lost.id })
          .catch(() => undefined)
        dependencies.logger.warn(NFE_XML_RECEIPT_LOG.summarySent, {
          channel: lost.channel,
          companyId: lost.companyId,
          errorName: error instanceof Error ? error.name : typeof error,
          receiptId: lost.id,
          sent: false,
        })
      }
    }
  }
  return { failed, sent }
}

type PlannedMessage = {
  readonly email?: { readonly body: string; readonly subject: string } | undefined
  readonly rows: readonly ReceiptSummaryRow[]
  readonly text: string
}

/**
 * Quem manda vários arquivos pelo WhatsApp em sequência recebe **uma** resposta por remetente e conversa, não uma por
 * arquivo: os resultados prontos viram um resumo só (contagens somadas, problemas juntos) e as recusas/falhas de texto
 * igual viram uma mensagem só. O e-mail segue um recibo por e-mail, com o relatório detalhado.
 */
function planMessages(rows: readonly ReceiptSummaryRow[]): readonly PlannedMessage[] {
  const planned: PlannedMessage[] = []
  const groups = new Map<string, ReceiptSummaryRow[]>()
  for (const row of rows) {
    if (row.channel !== 'whatsapp') {
      planned.push({ email: emailForReceipt(row), rows: [row], text: textForReceipt(row) })
      continue
    }
    const key = [row.companyId, row.sender, row.replyTo ?? ''].join('|')
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  for (const group of groups.values()) {
    const done = group.filter((row) => row.status === 'imported' && row.counts !== null)
    if (done.length > 0) planned.push({ rows: done, text: combinedSummary(done) })
    const byText = new Map<string, ReceiptSummaryRow[]>()
    for (const row of group.filter((entry) => !done.includes(entry))) {
      const text = textForReceipt(row)
      byText.set(text, [...(byText.get(text) ?? []), row])
    }
    for (const [text, sameText] of byText) planned.push({ rows: sameText, text })
  }
  return planned
}

function combinedSummary(rows: readonly ReceiptSummaryRow[]): string {
  const counts = { duplicated: 0, failed: 0, imported: 0, invalid: 0, received: 0, rejected: 0 }
  const problems = new Map<string, number>()
  for (const row of rows) {
    if (row.counts === null) continue
    counts.duplicated += row.counts.duplicated
    counts.failed += row.counts.failed
    counts.imported += row.counts.imported
    counts.invalid += row.counts.invalid
    counts.received += row.counts.received
    counts.rejected += row.counts.rejected
    for (const problem of row.problems) {
      problems.set(problem.code, (problems.get(problem.code) ?? 0) + problem.count)
    }
  }
  return buildSummary({
    counts,
    problems: [...problems].map(([code, count]) => ({ code, count })),
    report: mergeReports(rows.flatMap((row) => (row.report == null ? [] : [row.report]))),
  })
}
