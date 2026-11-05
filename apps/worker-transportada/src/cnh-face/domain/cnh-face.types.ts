/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CNH_FACE_OUTCOMES, CNH_SOURCE_KINDS } from './cnh-face.constant.js'

export type CnhFaceOutcome = (typeof CNH_FACE_OUTCOMES)[keyof typeof CNH_FACE_OUTCOMES]
export type CnhSourceKind = (typeof CNH_SOURCE_KINDS)[keyof typeof CNH_SOURCE_KINDS]

/** Sem PII: nota, contagens e medidas. `webp` só existe quando o desfecho é `extracted`. */
export type CnhFaceResult = {
  readonly candidateImages: number
  readonly cropShortSide?: number | undefined
  readonly faceScore?: number | undefined
  readonly facesFound: number
  readonly outcome: CnhFaceOutcome
  readonly sourceKind: CnhSourceKind
  readonly webp?: Uint8Array | undefined
}

export type RawImage = {
  readonly height: number
  readonly rgb: Buffer
  readonly width: number
}

export type FaceBox = {
  readonly score: number
  readonly x1: number
  readonly x2: number
  readonly y1: number
  readonly y2: number
}
