/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CanhotoOcrCandidate, CanhotoOcrResult } from '../domain/canhoto-ocr.types.js'

export type ReadCanhotoParams = Readonly<{
  bytes: Uint8Array
  candidates: readonly CanhotoOcrCandidate[]
  /** Spec 294 S7: quem pediu (a empresa); uma foto por vez por chave. */
  queueKey?: string | undefined
}>

export type CanhotoOcrReaderPort = Readonly<{
  /** Rejeita com `CanhotoOcrError` (prazo, fila cheia, motor carregando ou falha do motor). */
  read: (params: ReadCanhotoParams) => Promise<CanhotoOcrResult>
  /** Spec 294 C6: sobe a thread e carrega os modelos; `true` quando pronta, `false` se a carga falhou ou estourou. */
  start?: () => Promise<boolean>
  close: () => Promise<void>
}>

export class CanhotoOcrError extends Error {
  override readonly name = 'CanhotoOcrError'
  constructor(readonly reason: 'busy' | 'engine_failed' | 'timeout') {
    super(reason)
  }
}
