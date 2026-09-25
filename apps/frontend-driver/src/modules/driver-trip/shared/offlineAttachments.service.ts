/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/offlineAttachments.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverReportedLocation, ProofPunctuality } from './driverTrip.types'
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
  /** Spec 159 RF3/RF5-RF6: posição lida no momento da captura — dado pessoal, nunca em log. */
  accuracyMeters?: number
  latitude?: number
  longitude?: number
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
  | Readonly<{ accepted: false; reason: 'count-limit' | 'size-limit' }>

/** Spec 159 (revisão D6): a chave sintética de um documento sem evento de entrega na fila. */
export function documentAttachmentKey(documentId: string): string {
  return `document:${documentId}`
}

/**
 * O anexo procura primeiro o evento de entrega **ainda na fila** daquela nota — "evento primeiro",
 * como antes. Spec 159: quando a entrega já saiu da fila (já foi aceita, ou é anexo em lote de uma
 * nota entregue em sessão anterior), o anexo entra do mesmo jeito, referenciado por uma chave própria
 * do documento — a foto nunca fica de fora da fila offline só porque a entrega já subiu.
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
  const eventKey =
    target?.report.idempotencyKey ?? documentAttachmentKey(input.attachment.documentId)

  /** A recusa vem **antes** de qualquer escrita: teto atingido não descarta o que já está lá. */
  const limits = input.limits ?? ATTACHMENT_QUEUE_LIMIT
  const totals = await input.attachmentStore.readTotals()
  if (totals.count + 1 > limits.maxCount) return { accepted: false, reason: 'count-limit' }
  if (totals.totalBytes + input.attachment.blob.size > limits.maxTotalBytes) {
    return { accepted: false, reason: 'size-limit' }
  }

  await input.attachmentStore.update({
    eventKey,
    mutate: (existing) => [...existing, input.attachment],
  })

  return { accepted: true, eventKey }
}

/**
 * Spec 159 (T11, item 6): a foto entra no IndexedDB **antes** de esperar o GPS — só assim ela
 * nunca se perde se o motorista fechar o app durante a leitura de posição (até 8 s). A posição
 * chega depois, por esta função, atualizando o mesmo item pela `attachmentKey`.
 */
export function applyAttachmentLocation(input: {
  readonly attachmentKey: string
  readonly items: readonly QueuedAttachment[]
  readonly location: DriverReportedLocation
}): readonly QueuedAttachment[] {
  return input.items.map((item) =>
    item.attachmentKey === input.attachmentKey
      ? {
          ...item,
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          ...(input.location.accuracyMeters === undefined
            ? {}
            : { accuracyMeters: input.location.accuracyMeters }),
        }
      : item,
  )
}

/**
 * Spec 159 (T11, item 4): anexo recusado ou simplesmente parado — nunca enviado — expira aos 7
 * dias. Risco aceito registrado em `docs/SECURITY.md`: a fila offline guarda posição, e ela não
 * pode ficar indefinidamente no aparelho.
 */
export const ATTACHMENT_DISCARD_AFTER_MS = 7 * 24 * 60 * 60 * 1000

export function isAttachmentDiscardable(input: {
  readonly attachment: QueuedAttachment
  readonly now: Date
}): boolean {
  const capturedAt = new Date(input.attachment.capturedAt).getTime()
  if (!Number.isFinite(capturedAt)) return false
  return input.now.getTime() - capturedAt > ATTACHMENT_DISCARD_AFTER_MS
}

/** Descarta o anexo **e o dado**: o blob e a posição somem da store, não só o item da lista. */
export async function discardStaleAttachments(input: {
  readonly attachmentStore: AttachmentStore
  readonly now: Date
}): Promise<number> {
  const groups = await input.attachmentStore.readAll()
  let discardedCount = 0

  for (const [eventKey, attachments] of groups) {
    const hasStale = attachments.some((attachment) =>
      isAttachmentDiscardable({ attachment, now: input.now }),
    )
    if (!hasStale) continue

    const remaining = await input.attachmentStore.update({
      eventKey,
      mutate: (current) =>
        current.filter((attachment) => !isAttachmentDiscardable({ attachment, now: input.now })),
    })
    discardedCount += attachments.length - remaining.length
  }

  return discardedCount
}

export type AttachmentSendOutcome =
  | Readonly<{ kind: 'failed-network' }>
  | Readonly<{ cause: string; kind: 'rejected' }>
  /** Spec 159 RF4: a pontualidade que a API grava junto da foto — `undefined` para assinatura. */
  | Readonly<{ kind: 'sent'; punctuality?: ProofPunctuality }>

export type AttachmentDrainResult = Readonly<{
  /** Anexos que o servidor recusou: causa própria, sem contaminar o evento já aceito. */
  attachmentsRejected: number
  /** Spec 159 (P6): a pontualidade de cada foto que subiu nesta drenagem — a tela traduz em linguagem simples. */
  attachmentsSent: readonly Readonly<{ documentId: string; punctuality?: ProofPunctuality }>[]
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
  const attachmentsSent: { documentId: string; punctuality?: ProofPunctuality }[] = []
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
        if (outcome.kind === 'sent') {
          attachmentsSent.push({
            documentId: attachment.documentId,
            ...(outcome.punctuality === undefined ? {} : { punctuality: outcome.punctuality }),
          })
        }
      }
    }
  }

  return { attachmentsRejected, attachmentsSent, rejected, remaining: remainingQueue.length, sent }
}
