/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  CNH_FACE_ACCEPTANCE_MIN_SCORE,
  CNH_FACE_ACCEPTANCE_MIN_SHORT_SIDE,
  CNH_FACE_OUTCOMES,
} from './cnh-face.constant.js'
import type { CnhFaceResult } from './cnh-face.types.js'

/** Spec 295 Fase 4: rosto único, nota ≥ 0,98 e lado curto ≥ 120 px; o resto fica com as iniciais. */
export function isAcceptableCnhFace(
  result: CnhFaceResult,
): result is CnhFaceResult & { readonly webp: Uint8Array } {
  return (
    result.outcome === CNH_FACE_OUTCOMES.EXTRACTED &&
    result.facesFound === 1 &&
    result.webp !== undefined &&
    (result.faceScore ?? 0) >= CNH_FACE_ACCEPTANCE_MIN_SCORE &&
    (result.cropShortSide ?? 0) >= CNH_FACE_ACCEPTANCE_MIN_SHORT_SIDE
  )
}
