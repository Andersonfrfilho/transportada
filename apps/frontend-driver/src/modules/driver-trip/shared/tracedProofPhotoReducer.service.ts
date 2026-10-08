/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getDriverDiagnostics } from './driverTripClient.service'
import {
  EVENT_KIND_SEND_FAILED,
  EVENT_KIND_STEP_TIMING,
  STEP_PHOTO_REDUCE,
} from './clientDiagnostics.constant'
import { reduceProofPhotoToJpeg } from './proofPhotoReduction.service'

import type { ProofPhotoReducer } from './proofPhotoRecovery.service'

/** Spec 254: mede a redução da foto no aparelho sem mudar o que ela devolve nem lança. */
export const reduceProofPhotoWithTiming: ProofPhotoReducer = async (file) => {
  const startedAt = Date.now()
  const describe = (eventKind: typeof EVENT_KIND_SEND_FAILED | typeof EVENT_KIND_STEP_TIMING) => ({
    durationMs: Date.now() - startedAt,
    eventKind,
    step: STEP_PHOTO_REDUCE,
  })
  try {
    const result = await reduceProofPhotoToJpeg(file)
    getDriverDiagnostics().record(describe(EVENT_KIND_STEP_TIMING))
    return result
  } catch (error) {
    getDriverDiagnostics().record({ ...describe(EVENT_KIND_SEND_FAILED), failureKind: 'local' })
    throw error
  }
}
