/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getDriverDiagnostics } from './driverTripClient.service'
import { reduceProofPhotoToJpeg } from './proofPhotoReduction.service'
import { createStepTimer } from './stepTimer.service'

import type { ProofPhotoReducer } from './proofPhotoRecovery.service'

/** Spec 254: mede a redução da foto no aparelho sem mudar o que ela devolve nem lança. */
export const reduceProofPhotoWithTiming: ProofPhotoReducer = async (file) => {
  const step = createStepTimer({
    clock: () => Date.now(),
    record: (event) => getDriverDiagnostics().record(event),
  }).startStep('photo_reduce')
  try {
    return await reduceProofPhotoToJpeg(file)
  } finally {
    step.end('completed')
  }
}
