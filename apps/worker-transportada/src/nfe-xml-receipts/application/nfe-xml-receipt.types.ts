/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: as portas do recebimento de XML de NF-e por e-mail e WhatsApp. O caso de uso decide; quem grava, baixa e
 * envia fica atrás destas portas, e os testes trocam todas por dublês.
 */
import type { NfeXmlReceiptChannel, NfeXmlReceiptStatus } from '../../database/nfe.schema.js'
import type { NfeXmlReceiptRejection } from '../domain/nfe-xml-receipt.constant.js'
import type { ReceiptImportCounts, ReceiptItemProblem } from '../domain/receipt-messages.policy.js'

export type ReceiptFile = { readonly bytes: Uint8Array; readonly name: string }

export type AuthorizedSender = { readonly userId: string }

/** O que o webhook do WhatsApp guarda para o worker baixar depois (o Evolution só baixa com a mensagem inteira). */
export type WhatsAppReceiptMedia = {
  readonly fileName: string
  readonly mimeType: string
  readonly rawMessage: { readonly key: unknown; readonly message: unknown }
  readonly sizeBytes: number
}

export type ReceiptRecord = {
  readonly attempts: number
  readonly channel: NfeXmlReceiptChannel
  readonly companyId: string
  readonly id: string
  readonly media: WhatsAppReceiptMedia | null
  readonly providerMessageId: string
  readonly replyTo: string | null
  readonly requestedByUserId: string | null
  readonly sender: string
}

export type RecordReceiptInput = {
  readonly channel: NfeXmlReceiptChannel
  readonly companyId: string
  readonly now: Date
  readonly providerMessageId: string
  readonly rejectReason?: NfeXmlReceiptRejection
  readonly replyTo?: string
  readonly requestedByUserId?: string
  readonly sender: string
  readonly status: Extract<NfeXmlReceiptStatus, 'pending' | 'processing' | 'rejected'>
}

export type ReceiptRepositoryPort = {
  /** Reserva o lote do WhatsApp: `pending` vencido vira `processing` e conta a tentativa. */
  claimPending(input: {
    readonly limit: number
    readonly now: Date
  }): Promise<readonly ReceiptRecord[]>
  /** Os `processing` abandonados por um worker que caiu voltam à fila. */
  releaseStale(input: { readonly now: Date; readonly staleSeconds: number }): Promise<number>
  /** Só para o recibo que ainda não decidiu nada e precisa ser refeito do zero na próxima entrega. */
  discardReceipt(input: { readonly receiptId: string }): Promise<void>
  findAuthorizedSenderByEmail(input: {
    readonly companyId: string
    readonly email: string
  }): Promise<AuthorizedSender | undefined>
  markAcknowledged(input: { readonly now: Date; readonly receiptId: string }): Promise<void>
  markFailed(input: {
    readonly errorCode: string
    readonly now: Date
    readonly receiptId: string
  }): Promise<void>
  markRejected(input: {
    readonly now: Date
    readonly reason: NfeXmlReceiptRejection
    readonly receiptId: string
  }): Promise<void>
  /** `created: false` quando o mesmo `(empresa, canal, mensagem)` já foi gravado: entrega repetida. */
  recordReceipt(
    input: RecordReceiptInput,
  ): Promise<{ readonly created: boolean; readonly receiptId: string }>
  scheduleRetry(input: {
    readonly errorCode: string
    readonly nextAttemptAt: Date
    readonly receiptId: string
  }): Promise<void>
}

export type ImportReceivedXmlInput = {
  readonly automationJob: string | null
  readonly companyId: string
  readonly correlationId: string
  readonly files: readonly ReceiptFile[]
  readonly receiptId: string
  readonly receivedFrom: string
  readonly receivedVia: NfeXmlReceiptChannel
  readonly requestedByUserId: string
}

export type ReceivedXmlImportGatewayPort = {
  /** Guarda os arquivos, cria a importação, os itens e o evento, e fecha o recibo — tudo na mesma transação. */
  createImport(input: ImportReceivedXmlInput): Promise<{ readonly importId: string }>
}

/** A resposta a quem mandou: o canal (e-mail ou WhatsApp) que a envia fica por trás desta porta. */
export type ReceiptReplyPort = {
  send(input: {
    readonly channel: NfeXmlReceiptChannel
    readonly companyId: string
    readonly replyTo: string | null
    readonly sender: string
    readonly text: string
  }): Promise<void>
}

export type ReceiptSummaryRow = {
  readonly channel: NfeXmlReceiptChannel
  readonly companyId: string
  readonly counts: ReceiptImportCounts | null
  readonly id: string
  readonly problems: readonly ReceiptItemProblem[]
  readonly rejectReason: NfeXmlReceiptRejection | null
  readonly replyTo: string | null
  readonly sender: string
  readonly status: Extract<NfeXmlReceiptStatus, 'failed' | 'imported' | 'rejected'>
}

export type ReceiptSummaryRepositoryPort = {
  /** Os recibos terminados (importação concluída, recusa ou falha) cujo resumo ainda não saiu. */
  findSummariesToSend(input: {
    readonly limit: number
    readonly maxAttempts: number
  }): Promise<readonly ReceiptSummaryRow[]>
  /** Conta a falha de envio; o recibo sai da fila quando passa de `summaryMaxAttempts`. */
  markSummaryAttempt(input: { readonly receiptId: string }): Promise<void>
  markSummarySent(input: { readonly now: Date; readonly receiptId: string }): Promise<void>
}

export type ReceiptLogger = {
  readonly error: (event: string, fields: Readonly<Record<string, unknown>>) => void
  readonly info: (event: string, fields: Readonly<Record<string, unknown>>) => void
  readonly warn: (event: string, fields: Readonly<Record<string, unknown>>) => void
}

/** Os alertas à operação: falha definitiva e fila parada. Sem conteúdo de nota, só contagem e código. */
export type ReceiptOperatorAlertPort = {
  notifyFailure(input: {
    readonly channel: NfeXmlReceiptChannel
    readonly companyId: string
    readonly errorCode: string
    readonly receiptId: string
  }): Promise<void>
}
