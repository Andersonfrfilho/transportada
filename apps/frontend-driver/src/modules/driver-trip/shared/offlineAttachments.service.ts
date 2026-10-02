/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/offlineAttachments.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverReportedLocation, ProofPunctuality } from './driverTrip.types'
import type { DriverTripErrorDetail, OfflineQueueStore, QueuedReport } from './offlineQueue.service'

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
  /** Spec 189 T9.2 ("Confirmar em lote"): capturado sem sessão — só sobe depois da confirmação. */
  isUnverified?: true
  kind: 'cargo' | 'photo' | 'signature'
  /** Pedido do usuário (25/09): mesma marca do `deliver`/`return` desta parada, atrás do mesmo interruptor. */
  lateRegistration?: boolean
  /** Spec 159 RF3/RF5-RF6: posição lida no momento da captura — dado pessoal, nunca em log. */
  accuracyMeters?: number
  latitude?: number
  longitude?: number
  /**
   * Spec 212: a foto gravada ainda não reduzida — nenhuma drenagem a leva, nem o envio manual. A
   * redução troca o arquivo e tira a marca; a falha dela também tira, e o original sobe.
   */
  pendingReduction?: true
  /** Spec 193 D1: quem recebeu, em relação ao destinatário — código de `RECEIVED_BY_OPTIONS`. */
  receivedBy?: string
  /** Spec 193 D1: o detalhe curto — nunca em log, mesmo espírito do nome e do documento. */
  receivedByDetail?: string
  /** ⚠️ Canônico e nunca em log: é o dado da ADR da spec 082 D4 — a API o criptografa. */
  receiverDocument?: string
  receiverName?: string
  /**
   * Recusa do servidor **do anexo**, não do evento: o evento aceito permanece aceito, e este campo
   * é o que a tela de pendentes imprime como problema do arquivo. Só o envio manual tenta de novo.
   */
  rejectionCause?: string
  /** ADR-0075 §8: o dono do anexo, como em `QueuedReport.subHash`. */
  subHash?: string
  /** Spec 220 RF17/RF19: a miniatura gerada com a redução; ausente sobe só o original. */
  thumbnail?: Blob
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

const AWAITING_DELIVERY_KEY_PREFIX = 'awaiting-delivery:'

/**
 * Spec 218 (RF-A3): o canhoto colhido **antes** da entrega. A API só aceita canhoto de nota com
 * entrega registrada, então este grupo nunca drena — espera o "Confirmar entrega" soltá-lo para o
 * grupo do evento (`releaseAttachmentsAwaitingDelivery`).
 */
export function awaitingDeliveryAttachmentKey(documentId: string): string {
  return `${AWAITING_DELIVERY_KEY_PREFIX}${documentId}`
}

export function isAwaitingDeliveryKey(eventKey: string): boolean {
  return eventKey.startsWith(AWAITING_DELIVERY_KEY_PREFIX)
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
  /** Spec 218: capturado antes da entrega — sem ela na fila, espera numa chave que não drena. */
  readonly awaitingDelivery?: boolean
  /** Boot sem rede (`canSync: false`): o anexo espera a confirmação do dono para subir. */
  readonly isUnverified?: boolean
  readonly limits?: AttachmentLimits
  readonly store: OfflineQueueStore
}): Promise<EnqueueAttachmentResult> {
  const queued = await input.store.read()
  const target = queued.find(
    (item) =>
      item.report.kind === 'deliver' && item.report.documentId === input.attachment.documentId,
  )
  const standaloneKey =
    input.awaitingDelivery === true
      ? awaitingDeliveryAttachmentKey(input.attachment.documentId)
      : documentAttachmentKey(input.attachment.documentId)
  const eventKey = target?.report.idempotencyKey ?? standaloneKey

  /** A recusa vem **antes** de qualquer escrita: teto atingido não descarta o que já está lá. */
  const limits = input.limits ?? ATTACHMENT_QUEUE_LIMIT
  const totals = await input.attachmentStore.readTotals()
  if (totals.count + 1 > limits.maxCount) return { accepted: false, reason: 'count-limit' }
  if (totals.totalBytes + input.attachment.blob.size > limits.maxTotalBytes) {
    return { accepted: false, reason: 'size-limit' }
  }

  await input.attachmentStore.update({
    eventKey,
    mutate: (existing) => [
      ...existing,
      input.isUnverified === true
        ? { ...input.attachment, isUnverified: true as const }
        : input.attachment,
    ],
  })

  return { accepted: true, eventKey }
}

/**
 * Spec 218 (RF-A3): a entrega entrou na fila — o canhoto que esperava por ela passa para o grupo do
 * evento e sobe atrás dele, como qualquer anexo. Grava no evento antes de apagar a espera:
 * interrompido no meio sobra uma cópia parada (a chave do anexo é idempotente na API), nunca falta.
 */
export async function releaseAttachmentsAwaitingDelivery(input: {
  readonly attachmentStore: AttachmentStore
  readonly documentId: string
  readonly eventKey: string
}): Promise<number> {
  const awaitingKey = awaitingDeliveryAttachmentKey(input.documentId)
  const awaiting = await input.attachmentStore.read(awaitingKey)
  if (awaiting.length === 0) return 0

  await input.attachmentStore.update({
    eventKey: input.eventKey,
    mutate: (existing) => [...existing, ...awaiting],
  })
  const releasedKeys = new Set(awaiting.map((attachment) => attachment.attachmentKey))
  await input.attachmentStore.update({
    eventKey: awaitingKey,
    mutate: (current) =>
      current.filter((attachment) => !releasedKeys.has(attachment.attachmentKey)),
  })
  return awaiting.length
}

/**
 * Spec 218: a entrega que o canhoto esperava não vai acontecer — o gate foi cancelado, ou a nota
 * voltou ("Não entreguei"). O anexo sai da fila na hora, em vez de esperar o descarte de 7 dias. O
 * que já foi solto para o grupo de uma entrega não é mais da espera, e fica.
 */
export async function discardAttachmentsAwaitingDelivery(input: {
  readonly attachmentStore: AttachmentStore
  readonly documentId: string
}): Promise<number> {
  const awaitingKey = awaitingDeliveryAttachmentKey(input.documentId)
  const awaiting = await input.attachmentStore.read(awaitingKey)
  if (awaiting.length === 0) return 0

  await input.attachmentStore.remove(awaitingKey)
  return awaiting.length
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
 * Spec 203 (o attach nunca descarta a foto): campo obrigatório vazio não pode jogar o anexo
 * fora — ele entra na fila do jeito que está, e quando o motorista completa nome/documento depois,
 * esta função alcança os itens do mesmo documento, igual `applyAttachmentLocation` alcança pela
 * `attachmentKey`. Casa por `documentId`, não por `attachmentKey`: a captura não devolve a chave
 * gerada ao formulário, e cobre foto e assinatura do mesmo documento na mesma chamada.
 */
export function applyAttachmentReceiverFields(input: {
  readonly documentId: string
  readonly items: readonly QueuedAttachment[]
  /** Spec 193 D7: a relação e o detalhe, alcançando o mesmo item pela `documentId`. */
  readonly receivedBy?: string
  readonly receivedByDetail?: string
  readonly receiverDocument?: string
  readonly receiverName?: string
}): readonly QueuedAttachment[] {
  return input.items.map((item) =>
    item.documentId === input.documentId
      ? {
          ...item,
          ...(input.receiverName === undefined ? {} : { receiverName: input.receiverName }),
          ...(input.receiverDocument === undefined
            ? {}
            : { receiverDocument: input.receiverDocument }),
          ...(input.receivedBy === undefined ? {} : { receivedBy: input.receivedBy }),
          ...(input.receivedByDetail === undefined
            ? {}
            : { receivedByDetail: input.receivedByDetail }),
        }
      : item,
  )
}

/**
 * Pedido do usuário (25/09, spec 207): "Remover" a foto/assinatura do canhoto — só cabe enquanto o
 * anexo ainda está na fila (nunca depois de enviado: não há rota de exclusão no servidor, e apagar
 * mexeria em pontualidade e auditoria já gravadas — spec 082).
 *
 * ⚠️ Casa por `attachmentKey`, nunca por `documentId`: a mesma nota pode ter mais de um anexo (spec
 * 211 traz foto de mercadoria além do canhoto) — filtrar pelo documento apagaria os outros anexos
 * dela junto, não só o que o motorista escolheu remover.
 */
export function removeQueuedAttachmentByKey(input: {
  readonly attachmentKey: string
  readonly items: readonly QueuedAttachment[]
}): readonly QueuedAttachment[] {
  return input.items.filter((item) => item.attachmentKey !== input.attachmentKey)
}

/** Spec 193 D7: o que o PATCH `.../proof/receiver` leva — `null` apaga o que estava gravado. */
export type ReceiverDriftFields = Readonly<{
  receivedBy?: string | null
  receivedByDetail?: string | null
  receiverName?: string | null
}>

/**
 * Spec 193 D7 (CA12): a edição que chegou **durante** o envio do anexo não se perde — a drenagem
 * compara o que foi mandado (`sent`, a foto de antes de chamar `sendAttachment`) com o que está
 * gravado agora (`stored`, depois de `sendAttachment` ter mutado a fila), e devolve a diferença.
 * `receivedBy` e `receivedByDetail` viajam juntos no PATCH — mudou um dos dois, os dois vão.
 */
export function detectReceiverDrift(input: {
  readonly sent: QueuedAttachment
  readonly stored: QueuedAttachment
}): ReceiverDriftFields | undefined {
  const { sent, stored } = input
  const receivedByChanged = sent.receivedBy !== stored.receivedBy
  const detailChanged = sent.receivedByDetail !== stored.receivedByDetail
  const nameChanged = sent.receiverName !== stored.receiverName
  if (!receivedByChanged && !detailChanged && !nameChanged) return undefined

  return {
    ...(nameChanged ? { receiverName: stored.receiverName ?? null } : {}),
    ...(receivedByChanged || detailChanged
      ? { receivedBy: stored.receivedBy ?? null, receivedByDetail: stored.receivedByDetail ?? null }
      : {}),
  }
}

export type AttachmentSendOutcome =
  | Readonly<{ kind: 'failed-network' }>
  | Readonly<{
      cause: string
      /** Spec 206 D9/RF8b: `error.details` da recusa, quando a API os manda (409 en-route). */
      details?: readonly DriverTripErrorDetail[]
      kind: 'rejected'
    }>
  /** Spec 159 RF4: a pontualidade que a API grava junto da foto — `undefined` para assinatura. */
  | Readonly<{ kind: 'sent'; punctuality?: ProofPunctuality }>

export type AttachmentDrainResult = Readonly<{
  /** Anexos que o servidor recusou: causa própria, sem contaminar o evento já aceito. */
  attachmentsRejected: number
  /**
   * Spec 159 (P6): a pontualidade de cada foto que subiu nesta drenagem — a tela traduz em
   * linguagem simples. Spec 193 (D7): `receiverDrift` é o que mudou entre o envio e a gravação —
   * quem chama enfileira um `proofReceiver` quando ele vier preenchido.
   */
  attachmentsSent: readonly Readonly<{
    documentId: string
    punctuality?: ProofPunctuality
    receiverDrift?: ReceiverDriftFields
  }>[]
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
  /**
   * ADR-0075 §8: com dono, só sai o que é dele — nem o envio manual (`only`) manda item de outra
   * conta. Sem dono, a drenagem é a de sempre.
   */
  readonly ownerSubHash?: string
  readonly send: (report: QueuedReport['report']) => Promise<AttachmentSendOutcome>
  readonly sendAttachment: (attachment: QueuedAttachment) => Promise<AttachmentSendOutcome>
  readonly store: OfflineQueueStore
}): Promise<AttachmentDrainResult> {
  const queued = await input.store.read()
  const sentKeys = new Set<string>()
  const rejectionByKey = new Map<string, string>()
  const rejectionDetailsByKey = new Map<string, readonly DriverTripErrorDetail[]>()
  let failedNetworkKey: string | undefined
  let sent = 0
  let rejected = 0
  let networkDown = false
  let blockedByUnverified = false

  for (const item of queued) {
    const key = item.report.idempotencyKey
    const isTargeted = input.only === undefined || key === input.only
    const skipRejected = input.only === undefined && item.rejectionCause !== undefined
    const isForeign = input.ownerSubHash !== undefined && item.subHash !== input.ownerSubHash
    if (isForeign) continue
    /**
     * Gravado sem sessão: nem o envio manual leva — só a confirmação do dono tira a marca. E o que
     * vem **depois** dele espera também (N3): "Entreguei" drenado antes do "Cheguei" não verificado
     * entregaria numa parada em que o servidor não sabe que ele chegou.
     */
    if (item.isUnverified === true) blockedByUnverified = true
    if (networkDown || blockedByUnverified || !isTargeted || skipRejected) continue

    const outcome = await input.send(item.report)
    if (outcome.kind === 'sent') {
      sentKeys.add(key)
      sent += 1
      continue
    }
    if (outcome.kind === 'rejected') {
      rejectionByKey.set(key, outcome.cause)
      if (outcome.details !== undefined) rejectionDetailsByKey.set(key, outcome.details)
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
        const details = rejectionDetailsByKey.get(key)
        return [
          {
            attempts: item.attempts,
            createdAt: item.createdAt,
            ...(item.isUnverified === true ? { isUnverified: true as const } : {}),
            rejectionCause: cause,
            ...(details === undefined ? {} : { rejectionDetails: details }),
            report: item.report,
            ...(item.subHash === undefined ? {} : { subHash: item.subHash }),
          },
        ]
      }
      if (key === failedNetworkKey) return [{ ...item, attempts: item.attempts + 1 }]
      return [item]
    }),
  )

  let attachmentsRejected = 0
  const attachmentsSent: {
    documentId: string
    punctuality?: ProofPunctuality
    receiverDrift?: ReceiverDriftFields
  }[] = []
  if (!networkDown) {
    const queuedEventKeys = new Set(remainingQueue.map((item) => item.report.idempotencyKey))
    const groups = await input.attachmentStore.readAll()

    for (const [eventKey, attachments] of groups) {
      if (networkDown) break
      const isTargeted = input.only === undefined || eventKey === input.only
      /** O evento vai primeiro: grupo cujo evento ainda está na fila espera a vez dele. */
      if (!isTargeted || queuedEventKeys.has(eventKey)) continue
      /** Spec 218: canhoto de antes da entrega — nem o envio manual o leva sem ela. */
      if (isAwaitingDeliveryKey(eventKey)) continue

      for (const attachment of attachments) {
        const skipRejectedAttachment =
          input.only === undefined && attachment.rejectionCause !== undefined
        const isForeignAttachment =
          input.ownerSubHash !== undefined && attachment.subHash !== input.ownerSubHash
        if (
          skipRejectedAttachment ||
          isForeignAttachment ||
          attachment.isUnverified === true ||
          attachment.pendingReduction === true
        ) {
          continue
        }

        const outcome = await input.sendAttachment(attachment)
        if (outcome.kind === 'failed-network') {
          networkDown = true
          break
        }
        /**
         * Spec 193 D7: capturado **dentro** do `mutate`, antes de remover o item — é aqui que a
         * fila ainda tem o estado gravado no exato instante do envio, mesmo que `sendAttachment`
         * (acima) tenha mutado a fila por fora enquanto o anexo subia.
         */
        let sentDrift: ReceiverDriftFields | undefined
        await input.attachmentStore.update({
          eventKey,
          mutate: (current) => {
            if (outcome.kind === 'sent') {
              const stored = current.find((item) => item.attachmentKey === attachment.attachmentKey)
              if (stored !== undefined) {
                sentDrift = detectReceiverDrift({ sent: attachment, stored })
              }
              return current.filter((item) => item.attachmentKey !== attachment.attachmentKey)
            }
            return current.map((item) =>
              item.attachmentKey === attachment.attachmentKey
                ? { ...item, rejectionCause: outcome.cause }
                : item,
            )
          },
        })
        if (outcome.kind === 'rejected') attachmentsRejected += 1
        if (outcome.kind === 'sent') {
          attachmentsSent.push({
            documentId: attachment.documentId,
            ...(outcome.punctuality === undefined ? {} : { punctuality: outcome.punctuality }),
            ...(sentDrift === undefined ? {} : { receiverDrift: sentDrift }),
          })
        }
      }
    }
  }

  return { attachmentsRejected, attachmentsSent, rejected, remaining: remainingQueue.length, sent }
}
