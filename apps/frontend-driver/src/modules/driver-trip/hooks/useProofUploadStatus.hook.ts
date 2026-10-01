/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  INITIAL_PROOF_UPLOAD_TRACKER,
  resolveProofUploadStatus,
  trackProofUpload,
  type ProofUploadObservation,
  type ProofUploadStatus,
} from '../shared/proofUploadStatus.service'

export type ProofUploadView = Readonly<{
  sentAt: string | undefined
  status: ProofUploadStatus
}>

/**
 * Estado do envio do anexo, derivado da fila a cada render. O único estado guardado é o rastro
 * (já esteve na fila? quando saiu?), atualizado durante o render e não em efeito: a hora da
 * confirmação nasce no mesmo render que viu a saída, sem um quadro intermediário errado.
 */
export function useProofUploadStatus(observation: ProofUploadObservation): ProofUploadView {
  const [tracker, setTracker] = useState(() =>
    trackProofUpload({
      now: new Date().toISOString(),
      observation,
      previous: INITIAL_PROOF_UPLOAD_TRACKER,
    }),
  )
  const nextTracker = trackProofUpload({
    now: new Date().toISOString(),
    observation,
    previous: tracker,
  })
  if (nextTracker !== tracker) setTracker(nextTracker)

  return {
    sentAt: nextTracker.sentAt,
    status: resolveProofUploadStatus({ observation, tracker: nextTracker }),
  }
}
