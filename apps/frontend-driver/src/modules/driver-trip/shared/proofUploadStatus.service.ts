/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { EventQueueItemView } from './eventQueueView.service'

export type ProofUploadStatus = 'empty' | 'failed' | 'sent' | 'uploading'

/** O que a fila diz, neste render, sobre o anexo de um kind da nota. */
export type ProofUploadObservation = Readonly<{
  isAttached: boolean
  isQueued: boolean
  isRejected: boolean
}>

/** O que a tela lembra entre renders: já viu o anexo na fila? e quando o servidor o aceitou? */
export type ProofUploadTracker = Readonly<{
  hasBeenQueued: boolean
  sentAt: string | undefined
}>

export const INITIAL_PROOF_UPLOAD_TRACKER: ProofUploadTracker = {
  hasBeenQueued: false,
  sentAt: undefined,
}

export function resolveProofUploadObservation(input: {
  readonly documentId: string
  readonly kind: 'photo' | 'signature'
  readonly queueView: readonly EventQueueItemView[]
}): Omit<ProofUploadObservation, 'isAttached'> {
  const holders = input.queueView.filter((item) =>
    (item.proofAttachments ?? []).some(
      (attachment) => attachment.documentId === input.documentId && attachment.kind === input.kind,
    ),
  )
  const isRejected = holders.some(
    (item) => item.status.state === 'rejected' || item.attachmentRejectionCause !== undefined,
  )
  return { isQueued: holders.length > 0, isRejected }
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
    const isAlreadyClear = !previous.hasBeenQueued && previous.sentAt === undefined
    return isAlreadyClear ? previous : INITIAL_PROOF_UPLOAD_TRACKER
  }
  if (observation.isQueued) {
    if (previous.hasBeenQueued && previous.sentAt === undefined) return previous
    return { hasBeenQueued: true, sentAt: undefined }
  }
  if (previous.hasBeenQueued && previous.sentAt === undefined) {
    return { hasBeenQueued: true, sentAt: now }
  }
  return previous
}

export function resolveProofUploadStatus(input: {
  readonly observation: ProofUploadObservation
  readonly tracker: ProofUploadTracker
}): ProofUploadStatus {
  const { observation, tracker } = input
  if (!observation.isAttached) return 'empty'
  if (observation.isRejected) return 'failed'
  if (observation.isQueued) return 'uploading'
  return tracker.sentAt === undefined ? 'uploading' : 'sent'
}
