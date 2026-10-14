/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState, useSyncExternalStore } from 'react'

import {
  INITIAL_PROOF_UPLOAD_TRACKER,
  PROOF_UNSEEN_IN_QUEUE_GRACE_MS,
  resolveProofUploadStatus,
  trackProofUpload,
  type ProofUploadObservation,
  type ProofUploadStatus,
} from '../shared/proofUploadStatus.service'
import {
  proofProgressKey,
  proofUploadProgress,
  type ProofProcessingState,
} from '../shared/proofUploadProgress.service'

export type ProofUploadView = Readonly<{
  /** Spec 265 RF10: o servidor aceitou e ainda trata o arquivo — "Enviado, processando". */
  processingState?: ProofProcessingState
  sentAt: string | undefined
  status: ProofUploadStatus
  /** Spec 265 RF12: porcentagem real de bytes enviados, só enquanto este aparelho está subindo o arquivo. */
  uploadPercent?: number
}>

/** De qual anexo é o envio: chave da barra de progresso. */
export type ProofUploadSource = Readonly<{ documentId: string; kind: string }>

/**
 * Estado do envio do anexo, derivado da fila a cada render. O único estado guardado é o rastro
 * (já esteve na fila? quando saiu?), atualizado durante o render e não em efeito: a hora da
 * confirmação nasce no mesmo render que viu a saída, sem um quadro intermediário errado.
 */
export function useProofUploadStatus(
  observation: ProofUploadObservation,
  source?: ProofUploadSource,
): ProofUploadView {
  const progressEntries = useSyncExternalStore(
    proofUploadProgress.subscribe,
    proofUploadProgress.snapshot,
    proofUploadProgress.snapshot,
  )
  const progress = source === undefined ? undefined : progressEntries[proofProgressKey(source)]
  const [tracker, setTracker] = useState(() =>
    trackProofUpload({
      now: new Date().toISOString(),
      observation,
      previous: INITIAL_PROOF_UPLOAD_TRACKER,
    }),
  )
  const [, setTick] = useState(0)
  const nextTracker = trackProofUpload({
    now: new Date().toISOString(),
    observation,
    previous: tracker,
  })
  if (nextTracker !== tracker) setTracker(nextTracker)

  /** Sem render novo ninguém reavalia a folga: um temporizador chama o próximo. */
  const isWaitingForQueue =
    nextTracker.unqueuedSince !== undefined && nextTracker.sentAt === undefined
  useEffect(() => {
    if (!isWaitingForQueue) return undefined
    const timer = setTimeout(
      () => setTick((current) => current + 1),
      PROOF_UNSEEN_IN_QUEUE_GRACE_MS,
    )
    return () => clearTimeout(timer)
  }, [isWaitingForQueue])

  const status = resolveProofUploadStatus({ observation, tracker: nextTracker })
  return {
    ...(progress?.processingState === undefined || (status !== 'sent' && status !== 'uploading')
      ? {}
      : { processingState: progress.processingState }),
    sentAt: nextTracker.sentAt,
    status,
    ...(progress === undefined || status !== 'uploading' || progress.processingState !== undefined
      ? {}
      : { uploadPercent: progress.percent }),
  }
}
