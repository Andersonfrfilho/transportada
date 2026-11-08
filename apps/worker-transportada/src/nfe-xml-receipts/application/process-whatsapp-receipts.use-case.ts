/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: o ciclo do WhatsApp. O webhook só gravou o recibo (`pending`) — aqui o worker o baixa, em lotes, no ritmo
 * dele: nada é recusado por volume, o que passa do lote espera o próximo ciclo. Falha de rede ou de storage volta à
 * fila com espera crescente e, esgotadas as tentativas, vira `failed` com aviso a quem mandou e à operação — nunca
 * some em silêncio. Recusa por conteúdo (sem `.xml`/`.zip`, arquivo grande demais) é definitiva e diz o motivo.
 */
import {
  NFE_XML_RECEIPT_LIMITS,
  NFE_XML_RECEIPT_LOG,
  NFE_XML_RECEIPT_REJECTION,
  type NfeXmlReceiptRejection,
} from '../domain/nfe-xml-receipt.constant.js'
import { buildAcknowledgement } from '../domain/receipt-messages.policy.js'
import { decideReceiptRetry } from '../domain/receipt-retry.policy.js'
import { convertRarToZip } from '../domain/rar-to-zip.policy.js'
import { chunkOversizedZip } from '../domain/zip-queue-chunking.policy.js'
import { classifyReceivedFiles } from '../domain/received-xml-files.policy.js'
import type {
  ReceiptFile,
  ReceiptLogger,
  ReceiptOperatorAlertPort,
  ReceiptRecord,
  ReceiptReplyPort,
  ReceiptRepositoryPort,
  ReceivedXmlImportGatewayPort,
} from './nfe-xml-receipt.types.js'

export type WhatsAppReceiptDependencies = {
  readonly alerts: ReceiptOperatorAlertPort
  /** Baixa o arquivo pelo Evolution; erro de rede lança, tamanho acima do teto devolve `too_large`. */
  readonly downloadMedia: (input: {
    readonly companyId: string
    readonly maxBytes: number
    readonly media: NonNullable<ReceiptRecord['media']>
  }) => Promise<{ readonly bytes: Uint8Array } | { readonly kind: 'too_large' }>
  readonly importGateway: ReceivedXmlImportGatewayPort
  readonly logger: ReceiptLogger
  readonly now: () => Date
  readonly reply: ReceiptReplyPort
  readonly repository: ReceiptRepositoryPort
}

export type WhatsAppReceiptCycleResult = {
  readonly failed: number
  readonly imported: number
  readonly rejected: number
  readonly released: number
  readonly retried: number
}

export async function processWhatsAppReceipts(
  dependencies: WhatsAppReceiptDependencies,
): Promise<WhatsAppReceiptCycleResult> {
  const { repository } = dependencies
  const now = dependencies.now()
  const released = await repository.releaseStale({
    now,
    staleSeconds: NFE_XML_RECEIPT_LIMITS.staleProcessingSeconds,
  })
  const batch = await repository.claimPending({
    limit: NFE_XML_RECEIPT_LIMITS.whatsappBatchSize,
    now,
  })
  const result = { failed: 0, imported: 0, rejected: 0, released, retried: 0 }
  const startedAt = Date.now()
  const imported: ReceiptRecord[] = []
  for (const receipt of batch) {
    const outcome = await processOne(receipt, dependencies)
    result[outcome] += 1
    if (outcome === 'imported') imported.push(receipt)
  }
  await acknowledgeGroups(imported, dependencies)
  dependencies.logger.info(NFE_XML_RECEIPT_LOG.batch, {
    channel: 'whatsapp',
    claimed: batch.length,
    durationMs: Date.now() - startedAt,
    ...result,
  })
  return result
}

async function processOne(
  receipt: ReceiptRecord,
  dependencies: WhatsAppReceiptDependencies,
): Promise<'failed' | 'imported' | 'rejected' | 'retried'> {
  const { logger, repository } = dependencies
  const reject = async (reason: NfeXmlReceiptRejection) => {
    await repository.markRejected({ now: dependencies.now(), reason, receiptId: receipt.id })
    logger.warn(NFE_XML_RECEIPT_LOG.rejected, {
      channel: 'whatsapp',
      companyId: receipt.companyId,
      reason,
      receiptId: receipt.id,
    })
    return 'rejected' as const
  }
  try {
    if (receipt.media === null || receipt.requestedByUserId === null) {
      return await reject(NFE_XML_RECEIPT_REJECTION.noAcceptedFile)
    }
    const classification = classifyReceivedFiles([
      { name: receipt.media.fileName, sizeBytes: receipt.media.sizeBytes },
    ])
    if (classification.accepted.length === 0) {
      const tooLarge = classification.skipped.some((entry) => entry.reason === 'file_too_large')
      return await reject(
        tooLarge ? NFE_XML_RECEIPT_REJECTION.tooLarge : NFE_XML_RECEIPT_REJECTION.noAcceptedFile,
      )
    }
    const downloaded = await dependencies.downloadMedia({
      companyId: receipt.companyId,
      maxBytes: NFE_XML_RECEIPT_LIMITS.maxFileBytes,
      media: receipt.media,
    })
    if ('kind' in downloaded) return await reject(NFE_XML_RECEIPT_REJECTION.tooLarge)
    // Zip com mais notas do que o expansor aceita de uma vez vira várias fatias da mesma importação (RN3).
    const files: readonly ReceiptFile[] = chunkOversizedZip(
      await convertRarToZip({ bytes: downloaded.bytes, name: receipt.media.fileName }),
    )
    const { importId } = await dependencies.importGateway.createImport({
      automationJob: null,
      companyId: receipt.companyId,
      correlationId: `nfe-xml-receipt:${receipt.id}`,
      files,
      receiptId: receipt.id,
      receivedFrom: receipt.sender,
      receivedVia: 'whatsapp',
      requestedByUserId: receipt.requestedByUserId,
    })
    logger.info(NFE_XML_RECEIPT_LOG.imported, {
      channel: 'whatsapp',
      companyId: receipt.companyId,
      files: files.length,
      importId,
      receiptId: receipt.id,
    })
    return 'imported'
  } catch (error: unknown) {
    return handleFailure(receipt, error, dependencies)
  }
}

/**
 * O aviso de "recebi" é cortesia: falhar em mandá-lo não desfaz nem repete a importação já criada. Quem manda vários
 * arquivos em sequência recebe **um** aviso por lote (mesma empresa, mesmo remetente, mesma conversa), não um por arquivo.
 */
async function acknowledgeGroups(
  receipts: readonly ReceiptRecord[],
  dependencies: WhatsAppReceiptDependencies,
): Promise<void> {
  const groups = new Map<string, ReceiptRecord[]>()
  for (const receipt of receipts) {
    const key = [receipt.companyId, receipt.sender, receipt.replyTo ?? ''].join('|')
    groups.set(key, [...(groups.get(key) ?? []), receipt])
  }
  for (const group of groups.values()) {
    const [first] = group
    if (first === undefined) continue
    try {
      await dependencies.reply.send({
        channel: 'whatsapp',
        companyId: first.companyId,
        replyTo: first.replyTo,
        sender: first.sender,
        text: buildAcknowledgement({ accepted: group.length, skipped: [] }),
      })
      for (const receipt of group) {
        await dependencies.repository.markAcknowledged({
          now: dependencies.now(),
          receiptId: receipt.id,
        })
        dependencies.logger.info(NFE_XML_RECEIPT_LOG.acknowledged, {
          channel: 'whatsapp',
          companyId: receipt.companyId,
          receiptId: receipt.id,
        })
      }
    } catch (error: unknown) {
      dependencies.logger.warn(NFE_XML_RECEIPT_LOG.acknowledged, {
        channel: 'whatsapp',
        companyId: first.companyId,
        errorName: error instanceof Error ? error.name : typeof error,
        receipts: group.length,
        sent: false,
      })
    }
  }
}

async function handleFailure(
  receipt: ReceiptRecord,
  error: unknown,
  dependencies: WhatsAppReceiptDependencies,
): Promise<'failed' | 'retried'> {
  const { logger, repository } = dependencies
  const errorCode = error instanceof Error ? error.name : 'unknown_error'
  const now = dependencies.now()
  const decision = decideReceiptRetry({ attemptsDone: receipt.attempts, now })
  if (decision.kind === 'retry') {
    await repository.scheduleRetry({
      errorCode,
      nextAttemptAt: decision.nextAttemptAt,
      receiptId: receipt.id,
    })
    logger.warn(NFE_XML_RECEIPT_LOG.retry, {
      attempts: receipt.attempts,
      channel: 'whatsapp',
      companyId: receipt.companyId,
      errorCode,
      nextAttemptAt: decision.nextAttemptAt.toISOString(),
      receiptId: receipt.id,
    })
    return 'retried'
  }
  await repository.markFailed({ errorCode, now, receiptId: receipt.id })
  logger.error(NFE_XML_RECEIPT_LOG.failed, {
    attempts: receipt.attempts,
    channel: 'whatsapp',
    companyId: receipt.companyId,
    errorCode,
    receiptId: receipt.id,
  })
  // O aviso à operação é melhor-esforço: o recibo já está `failed` e o resumo a quem mandou sai pelo ciclo de respostas.
  await dependencies.alerts
    .notifyFailure({
      channel: 'whatsapp',
      companyId: receipt.companyId,
      errorCode,
      receiptId: receipt.id,
    })
    .catch(() => undefined)
  return 'failed'
}
