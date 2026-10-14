/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getDriverDiagnostics } from './driverTripClient.service'
import {
  EVENT_KIND_SEND_FAILED,
  EVENT_KIND_STEP_TIMING,
  STEP_PHOTO_REDUCE,
} from './clientDiagnostics.constant'
import {
  PROOF_PHOTO_REDUCTION_BUDGET_MS,
  ProofPhotoReductionCancelledError,
  reduceProofPhotoToJpeg,
} from './proofPhotoReduction.service'

import type { ProofPhotoReducer } from './proofPhotoRecovery.service'

/**
 * Spec 254: mede a redução da foto no aparelho sem mudar o que ela devolve nem lança. Defeito de
 * 14/10: a redução que não termina estourava o teto em silêncio (nada nos logs); agora o estouro
 * também deixa um `send_failed` `timeout`, com o tamanho da foto.
 */
export const reduceProofPhotoWithTiming: ProofPhotoReducer = async (file, options) => {
  const startedAt = Date.now()
  const describe = (eventKind: typeof EVENT_KIND_SEND_FAILED | typeof EVENT_KIND_STEP_TIMING) => ({
    durationMs: Date.now() - startedAt,
    eventKind,
    photoBytes: file.size,
    step: STEP_PHOTO_REDUCE,
  })
  let isSettled = false
  let hasReportedTimeout = false
  /** Spec 265 RF9: o estouro do orçamento de 8 s vira um só `send_failed`/`timeout` (o modelo vem do User-Agent da API). */
  const reportTimeout = () => {
    if (hasReportedTimeout) return
    hasReportedTimeout = true
    getDriverDiagnostics().record({
      ...describe(EVENT_KIND_SEND_FAILED),
      failureKind: 'timeout',
    })
  }
  const timer = setTimeout(() => {
    if (!isSettled) reportTimeout()
  }, PROOF_PHOTO_REDUCTION_BUDGET_MS)
  try {
    const result = await reduceProofPhotoToJpeg(file, options)
    isSettled = true
    getDriverDiagnostics().record(describe(EVENT_KIND_STEP_TIMING))
    return result
  } catch (error) {
    isSettled = true
    if (error instanceof ProofPhotoReductionCancelledError) {
      reportTimeout()
      throw error
    }
    getDriverDiagnostics().record({ ...describe(EVENT_KIND_SEND_FAILED), failureKind: 'local' })
    throw error
  } finally {
    clearTimeout(timer)
  }
}
