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
  /**
   * Idempotência **por anexo**, gerada na captura e persistida: é o `attachmentKey` do multipart, e
   * é o que impede o reenvio de duplicar o blob que já subiu.
   */
  attachmentKey: string
  blob: Blob
  capturedAt: string
  documentId: string
  fileName: string
  kind: 'photo' | 'signature'
  /** ⚠️ Canônico e nunca em log: é o dado da ADR da spec 082 D4 — a API o criptografa. */
  receiverDocument?: string
  receiverName?: string
  /**
   * Recusa do servidor **do anexo**, não do evento: o evento aceito permanece aceito, e este campo
   * é o que a tela de pendentes imprime como problema do arquivo. Só o envio manual tenta de novo.
   */
  rejectionCause?: string
}>

export type AttachmentGroupEntries = readonly (readonly [string, readonly QueuedAttachment[]])[]

export type AttachmentStore = Readonly<{
  read: (eventKey: string) => Promise<readonly QueuedAttachment[]>
  /** Chaves e valores numa transação só — duas leituras separadas podiam discordar entre si. */
  readAll: () => Promise<AttachmentGroupEntries>
  readTotals: () => Promise<Readonly<{ count: number; totalBytes: number }>>
  remove: (eventKey: string) => Promise<void>
  /** Leitura e escrita na **mesma** transação; `mutate` devolvendo `[]` apaga a chave. */
  update: (input: {
    readonly eventKey: string
    readonly mutate: (items: readonly QueuedAttachment[]) => readonly QueuedAttachment[]
  }) => Promise<readonly QueuedAttachment[]>
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
  await input.attachmentStore.update({
    eventKey,
    mutate: (existing) => [...existing, input.attachment],
  })

  return { accepted: true, eventKey }
}

export type AttachmentSendOutcome =
  | Readonly<{ kind: 'failed-network' }>
  | Readonly<{ cause: string; kind: 'rejected' }>
  | Readonly<{ kind: 'sent' }>

export type AttachmentDrainResult = Readonly<{
  /** Anexos que o servidor recusou: causa própria, sem contaminar o evento já aceito. */
  attachmentsRejected: number
  rejected: number
  remaining: number
  sent: number
}>

/**
 * A mesma drenagem serve os três gatilhos — rede voltando, abertura do app e o envio manual da tela
 * de pendentes (`only` restringe a um evento ou grupo de anexos). Regras, na ordem:
 *
 * - Falha de **rede** para tudo e mantém: insistir sem sinal só gasta bateria.
 * - Recusa do **servidor** marca `rejectionCause` e o item fica à vista; a drenagem automática o
 *   pula, e só o envio manual tenta de novo.
 * - **Evento aceito permanece aceito**: ele sai da fila na hora, e os anexos dele sobem em seguida.
 *   Anexo recusado ganha causa própria no próprio anexo — o reenvio manual não re-POSTa o evento.
 * - Grupo de anexos cujo evento já subiu numa drenagem anterior também drena aqui.
 */
export async function drainQueueWithAttachments(input: {
  readonly attachmentStore: AttachmentStore
  readonly only?: string
  readonly send: (report: QueuedReport['report']) => Promise<AttachmentSendOutcome>
  readonly sendAttachment: (attachment: QueuedAttachment) => Promise<AttachmentSendOutcome>
  readonly store: OfflineQueueStore
}): Promise<AttachmentDrainResult> {
  const queued = await input.store.read()
  const sentKeys = new Set<string>()
  const rejectionByKey = new Map<string, string>()
  let failedNetworkKey: string | undefined
  let sent = 0
  let rejected = 0
  let networkDown = false

  for (const item of queued) {
    const key = item.report.idempotencyKey
    const isTargeted = input.only === undefined || key === input.only
    const skipRejected = input.only === undefined && item.rejectionCause !== undefined
    if (networkDown || !isTargeted || skipRejected) continue

    const outcome = await input.send(item.report)
    if (outcome.kind === 'sent') {
      sentKeys.add(key)
      sent += 1
      continue
    }
    if (outcome.kind === 'rejected') {
      rejectionByKey.set(key, outcome.cause)
      rejected += 1
      continue
    }
    networkDown = true
    failedNetworkKey = key
  }

  /** Reconciliação por chave, na mesma transação: toque enfileirado durante o envio fica. */
  const remainingQueue = await input.store.update((current) =>
    current.flatMap((item) => {
      const key = item.report.idempotencyKey
      if (sentKeys.has(key)) return []
      const cause = rejectionByKey.get(key)
      if (cause !== undefined) {
        return [
          {
            attempts: item.attempts,
            createdAt: item.createdAt,
            rejectionCause: cause,
            report: item.report,
          },
        ]
      }
      if (key === failedNetworkKey) return [{ ...item, attempts: item.attempts + 1 }]
      return [item]
    }),
  )

  let attachmentsRejected = 0
  if (!networkDown) {
    const queuedEventKeys = new Set(remainingQueue.map((item) => item.report.idempotencyKey))
    const groups = await input.attachmentStore.readAll()

    for (const [eventKey, attachments] of groups) {
      if (networkDown) break
      const isTargeted = input.only === undefined || eventKey === input.only
      /** O evento vai primeiro: grupo cujo evento ainda está na fila espera a vez dele. */
      if (!isTargeted || queuedEventKeys.has(eventKey)) continue

      for (const attachment of attachments) {
        const skipRejectedAttachment =
          input.only === undefined && attachment.rejectionCause !== undefined
        if (skipRejectedAttachment) continue

        const outcome = await input.sendAttachment(attachment)
        if (outcome.kind === 'failed-network') {
          networkDown = true
          break
        }
        await input.attachmentStore.update({
          eventKey,
          mutate: (current) =>
            outcome.kind === 'sent'
              ? current.filter((item) => item.attachmentKey !== attachment.attachmentKey)
              : current.map((item) =>
                  item.attachmentKey === attachment.attachmentKey
                    ? { ...item, rejectionCause: outcome.cause }
                    : item,
                ),
        })
        if (outcome.kind === 'rejected') attachmentsRejected += 1
      }
    }
  }

  return { attachmentsRejected, rejected, remaining: remainingQueue.length, sent }
}
