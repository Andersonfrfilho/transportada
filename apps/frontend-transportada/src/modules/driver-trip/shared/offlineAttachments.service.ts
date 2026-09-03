/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { OfflineQueueStore, QueuedReport } from './offlineQueue.service'

/**
 * Spec 082 D6: o comprovante entra na fila quando a entrega ainda não subiu. O blob mora numa store
 * própria do IndexedDB, referenciado pela chave de idempotência do evento — o evento continua sendo
 * a identidade, e o anexo vai atrás dele na drenagem.
 *
 * O teto é **declarado e anunciado**: ao atingi-lo, o anexo novo é recusado com razão tipada antes
 * de qualquer escrita — nunca se descarta nada em silêncio (ADR-0045 §5: a tela não mente).
 */
export const ATTACHMENT_QUEUE_LIMIT = {
  maxCount: 30,
  maxTotalBytes: 50 * 1024 * 1024,
} as const

export type AttachmentLimits = Readonly<{ maxCount: number; maxTotalBytes: number }>

export type QueuedAttachment = Readonly<{
  blob: Blob
  capturedAt: string
  documentId: string
  fileName: string
  kind: 'photo' | 'signature'
  receiverName?: string
}>

export type AttachmentStore = Readonly<{
  read: (eventKey: string) => Promise<readonly QueuedAttachment[]>
  /** Contagem por evento — é o que a tela de pendentes imprime ao lado de cada item. */
  readCounts: () => Promise<Readonly<Record<string, number>>>
  readTotals: () => Promise<Readonly<{ count: number; totalBytes: number }>>
  remove: (eventKey: string) => Promise<void>
  write: (eventKey: string, items: readonly QueuedAttachment[]) => Promise<void>
}>

export type EnqueueAttachmentResult =
  | Readonly<{ accepted: true; eventKey: string }>
  | Readonly<{ accepted: false; reason: 'count-limit' | 'event-not-queued' | 'size-limit' }>

/**
 * O anexo procura o evento de entrega **ainda na fila** daquela nota. Sem evento na fila a entrega
 * já subiu — e aí o caminho é a rota multipart direta, não esta função.
 */
export async function enqueueAttachment(input: {
  readonly attachment: QueuedAttachment
  readonly attachmentStore: AttachmentStore
  readonly limits?: AttachmentLimits
  readonly store: OfflineQueueStore
}): Promise<EnqueueAttachmentResult> {
  const queued = await input.store.read()
  const target = queued.find(
    (item) =>
      item.report.kind === 'deliver' && item.report.documentId === input.attachment.documentId,
  )
  if (target === undefined) return { accepted: false, reason: 'event-not-queued' }

  /** A recusa vem **antes** de qualquer escrita: teto atingido não descarta o que já está lá. */
  const limits = input.limits ?? ATTACHMENT_QUEUE_LIMIT
  const totals = await input.attachmentStore.readTotals()
  if (totals.count + 1 > limits.maxCount) return { accepted: false, reason: 'count-limit' }
  if (totals.totalBytes + input.attachment.blob.size > limits.maxTotalBytes) {
    return { accepted: false, reason: 'size-limit' }
  }

  const eventKey = target.report.idempotencyKey
  const existing = await input.attachmentStore.read(eventKey)
  await input.attachmentStore.write(eventKey, [...existing, input.attachment])

  return { accepted: true, eventKey }
}

export type AttachmentSendOutcome =
  | Readonly<{ kind: 'failed-network' }>
  | Readonly<{ cause: string; kind: 'rejected' }>
  | Readonly<{ kind: 'sent' }>

export type AttachmentDrainResult = Readonly<{
  rejected: number
  remaining: number
  sent: number
}>

/**
 * A mesma drenagem serve os três gatilhos — rede voltando, abertura do app e o envio manual da tela
 * de pendentes (`only` restringe a um evento). Regras, na ordem em que aparecem:
 *
 * - Falha de **rede** para tudo e mantém: insistir sem sinal só gasta bateria.
 * - Recusa do **servidor** marca `rejectionCause` e o item fica à vista; a drenagem automática o
 *   pula, e só o envio manual tenta de novo.
 * - Evento aceito envia os anexos dele pela rota multipart; **só com todos no ar** o par
 *   evento+blobs sai da fila — anexo que a rede derrubou mantém o evento (idempotente, repetir
 *   converge).
 */
export async function drainQueueWithAttachments(input: {
  readonly attachmentStore: AttachmentStore
  readonly only?: string
  readonly send: (report: QueuedReport['report']) => Promise<AttachmentSendOutcome>
  readonly sendAttachment: (attachment: QueuedAttachment) => Promise<AttachmentSendOutcome>
  readonly store: OfflineQueueStore
}): Promise<AttachmentDrainResult> {
  const queued = await input.store.read()
  const next: QueuedReport[] = []
  let sent = 0
  let rejected = 0
  let networkDown = false

  for (const item of queued) {
    const isTargeted = input.only === undefined || item.report.idempotencyKey === input.only
    const skipRejected = input.only === undefined && item.rejectionCause !== undefined
    if (networkDown || !isTargeted || skipRejected) {
      next.push(item)
      continue
    }

    const outcome = await sendEventWithAttachments({ ...input, item })
    if (outcome.kind === 'sent') {
      sent += 1
      continue
    }
    if (outcome.kind === 'rejected') {
      rejected += 1
      next.push({
        attempts: item.attempts,
        createdAt: item.createdAt,
        rejectionCause: outcome.cause,
        report: item.report,
      })
      continue
    }
    networkDown = true
    next.push({ attempts: item.attempts + 1, createdAt: item.createdAt, report: item.report })
  }

  await input.store.write(next)
  return { rejected, remaining: next.length, sent }
}

async function sendEventWithAttachments(input: {
  readonly attachmentStore: AttachmentStore
  readonly item: QueuedReport
  readonly send: (report: QueuedReport['report']) => Promise<AttachmentSendOutcome>
  readonly sendAttachment: (attachment: QueuedAttachment) => Promise<AttachmentSendOutcome>
}): Promise<AttachmentSendOutcome> {
  const outcome = await input.send(input.item.report)
  if (outcome.kind !== 'sent') return outcome

  const eventKey = input.item.report.idempotencyKey
  const attachments = await input.attachmentStore.read(eventKey)
  for (const [index, attachment] of attachments.entries()) {
    const attachmentOutcome = await input.sendAttachment(attachment)
    if (attachmentOutcome.kind !== 'sent') return attachmentOutcome
    /** O que já subiu sai na hora: a repetição do evento não pode reenviar o mesmo blob. */
    await input.attachmentStore.write(eventKey, attachments.slice(index + 1))
  }

  await input.attachmentStore.remove(eventKey)
  return { kind: 'sent' }
}
