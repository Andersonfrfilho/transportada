/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getDriverDiagnostics } from './driverTripClient.service'
import {
  EVENT_KIND_SEND_FAILED,
  EVENT_KIND_STEP_TIMING,
  STEP_PHOTO_REDUCE,
} from './clientDiagnostics.constant'
import {
  PROOF_PHOTO_REDUCTION_TIMEOUT_MS,
  reduceProofPhotoToJpeg,
} from './proofPhotoReduction.service'

import type { ProofPhotoReducer } from './proofPhotoRecovery.service'

/**
 * Spec 254: mede a redução da foto no aparelho sem mudar o que ela devolve nem lança. Defeito de
 * 14/10: a redução que não termina estourava o teto em silêncio (nada nos logs); agora o estouro
 * também deixa um `send_failed` `timeout`, com o tamanho da foto.
 */
export const reduceProofPhotoWithTiming: ProofPhotoReducer = async (file) => {
  const startedAt = Date.now()
  const describe = (eventKind: typeof EVENT_KIND_SEND_FAILED | typeof EVENT_KIND_STEP_TIMING) => ({
    durationMs: Date.now() - startedAt,
    eventKind,
    photoBytes: file.size,
    step: STEP_PHOTO_REDUCE,
  })
  let isSettled = false
  const timer = setTimeout(() => {
    if (isSettled) return
    getDriverDiagnostics().record({
      ...describe(EVENT_KIND_SEND_FAILED),
      failureKind: 'timeout',
    })
  }, PROOF_PHOTO_REDUCTION_TIMEOUT_MS)
  try {
    const result = await reduceProofPhotoToJpeg(file)
    isSettled = true
    getDriverDiagnostics().record(describe(EVENT_KIND_STEP_TIMING))
    return result
  } catch (error) {
    isSettled = true
    getDriverDiagnostics().record({ ...describe(EVENT_KIND_SEND_FAILED), failureKind: 'local' })
    throw error
  } finally {
    clearTimeout(timer)
  }
}
