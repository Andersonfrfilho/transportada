/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { EventQueueItemView } from './eventQueueView.service'
import { isAwaitingDeliveryKey } from './offlineAttachments.service'

export type ProofUploadStatus = 'empty' | 'failed' | 'reducing' | 'sent' | 'uploading' | 'waiting'

/**
 * Por que a foto está na fila **sem tentar subir**: `confirm` — foi colhida antes da entrega e só
 * sobe quando o motorista toca em "Confirmar entrega"; `delivery` — a entrega ainda está na fila e
 * a foto vai atrás dela.
 */
export type ProofWaitingFor = 'confirm' | 'delivery'

/** O que a fila diz, neste render, sobre o anexo de um kind da nota. */
export type ProofUploadObservation = Readonly<{
  isAttached: boolean
  /**
   * O servidor já tem a foto (snapshot: entregue, obrigatória, `proofPending` desligado). Cobre a
   * drenagem tão rápida que nenhum render viu o anexo na fila: sem isto a tela ficava em
   * "enviando" para sempre, com a fila vazia e o `/proof` já aceito (defeito de 14/10).
   */
  isConfirmedByServer?: boolean
  isQueued: boolean
  /** A foto na fila ainda espera a versão leve (redução em andamento no aparelho). */
  isReducing?: boolean
  isRejected: boolean
  /** A foto está na fila, mas não pode subir ainda (pedido do usuário, 14/10: dizer o porquê). */
  waitingFor?: ProofWaitingFor
}>

/** O que a tela lembra entre renders: já viu o anexo na fila? e quando o servidor o aceitou? */
export type ProofUploadTracker = Readonly<{
  hasBeenQueued: boolean
  sentAt: string | undefined
  /** Desde quando o anexo está "anexado" sem nunca ter sido visto na fila: base da folga abaixo. */
  unqueuedSince?: string
}>

/**
 * Defeito de 14/10 (staging): fila vazia, anexo nunca visto nela e nenhuma confirmação do snapshot
 * (foto opcional, ou snapshot ainda velho) deixavam "enviando" para sempre. O `enqueueProof` só
 * devolve depois de gravar e reler a fila, então um anexo que segue fora dela passado este prazo já
 * foi levado pela drenagem.
 */
export const PROOF_UNSEEN_IN_QUEUE_GRACE_MS = 4_000

export const INITIAL_PROOF_UPLOAD_TRACKER: ProofUploadTracker = {
  hasBeenQueued: false,
  sentAt: undefined,
}

export function resolveProofUploadObservation(input: {
  readonly documentId: string
  readonly kind: 'photo' | 'signature'
  readonly queueView: readonly EventQueueItemView[]
}): Omit<ProofUploadObservation, 'isAttached' | 'isConfirmedByServer'> {
  const holders = input.queueView.filter((item) =>
    (item.proofAttachments ?? []).some(
      (attachment) => attachment.documentId === input.documentId && attachment.kind === input.kind,
    ),
  )
  const isRejected = holders.some(
    (item) => item.status.state === 'rejected' || item.attachmentRejectionCause !== undefined,
  )
  const isReducing = holders.some((item) =>
    (item.proofAttachments ?? []).some(
      (attachment) =>
        attachment.documentId === input.documentId &&
        attachment.kind === input.kind &&
        attachment.isReducing === true,
    ),
  )
  const waitingFor = resolveWaitingFor(holders)
  return {
    isQueued: holders.length > 0,
    isReducing,
    isRejected,
    ...(waitingFor === undefined ? {} : { waitingFor }),
  }
}

function resolveWaitingFor(holders: readonly EventQueueItemView[]): ProofWaitingFor | undefined {
  if (holders.some((item) => isAwaitingDeliveryKey(item.idempotencyKey))) return 'confirm'
  if (holders.some((item) => item.kind !== 'proof')) return 'delivery'
  return undefined
}

/**
 * O servidor só aceita o anexo quando a drenagem o tira da fila — então "saiu da fila depois de
 * estar nela" é a confirmação, e a hora dela é a do render que viu a saída. Anexo recém-aceito que a
 * fila ainda não releu NÃO é "enviado": sem ter estado na fila, continua "enviando".
 */
export function trackProofUpload(input: {
  readonly now: string
  readonly observation: ProofUploadObservation
  readonly previous: ProofUploadTracker
}): ProofUploadTracker {
  const { now, observation, previous } = input
  if (!observation.isAttached) {
    const isAlreadyClear =
      !previous.hasBeenQueued &&
      previous.sentAt === undefined &&
      previous.unqueuedSince === undefined
    return isAlreadyClear ? previous : INITIAL_PROOF_UPLOAD_TRACKER
  }
  if (observation.isQueued) {
    if (previous.hasBeenQueued && previous.sentAt === undefined) return previous
    return { hasBeenQueued: true, sentAt: undefined }
  }
  if (previous.hasBeenQueued && previous.sentAt === undefined) {
    return { hasBeenQueued: true, sentAt: now }
  }
  if (previous.sentAt !== undefined) return previous
  if (previous.unqueuedSince === undefined) {
    return { hasBeenQueued: false, sentAt: undefined, unqueuedSince: now }
  }
  const waitedMs = Date.parse(now) - Date.parse(previous.unqueuedSince)
  return waitedMs >= PROOF_UNSEEN_IN_QUEUE_GRACE_MS
    ? { hasBeenQueued: true, sentAt: now }
    : previous
}

export function resolveProofUploadStatus(input: {
  readonly observation: ProofUploadObservation
  readonly tracker: ProofUploadTracker
}): ProofUploadStatus {
  const { observation, tracker } = input
  if (!observation.isAttached) return 'empty'
  if (observation.isRejected) return 'failed'
  if (observation.isReducing === true && observation.isQueued) return 'reducing'
  if (observation.isQueued) return observation.waitingFor === undefined ? 'uploading' : 'waiting'
  if (tracker.sentAt !== undefined) return 'sent'
  return observation.isConfirmedByServer === true ? 'sent' : 'uploading'
}

/**
 * O snapshot só diz "a foto chegou" para a foto obrigatória (`proofPending` desliga ao chegar);
 * para foto opcional e assinatura ele é mudo, então nada se infere deles.
 */
export function isProofConfirmedByServer(input: {
  readonly hasLocalAttachment: boolean
  readonly isDelivered: boolean
  readonly isRequired: boolean
  readonly kind: 'photo' | 'signature'
  readonly proofPending: boolean
}): boolean {
  if (input.kind !== 'photo') return false
  if (input.hasLocalAttachment) return false
  return input.isDelivered && input.isRequired && !input.proofPending
}
