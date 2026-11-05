/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CanhotoOcrCandidate, CanhotoOcrResult } from '../domain/canhoto-ocr.types.js'

export type ReadCanhotoParams = Readonly<{
  bytes: Uint8Array
  candidates: readonly CanhotoOcrCandidate[]
}>

export type CanhotoOcrReaderPort = Readonly<{
  /** Rejeita com `CanhotoOcrError` (prazo, fila cheia ou falha do motor). */
  read: (params: ReadCanhotoParams) => Promise<CanhotoOcrResult>
  close: () => Promise<void>
}>

export class CanhotoOcrError extends Error {
  override readonly name = 'CanhotoOcrError'
  constructor(readonly reason: 'busy' | 'engine_failed' | 'timeout') {
    super(reason)
  }
}
