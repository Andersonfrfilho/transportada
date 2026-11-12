/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type CanhotoOcrCandidate = Readonly<{ documentId: string; number: string }>

export type CanhotoOcrMatchKind = 'exact' | 'near'

/** Só veredito: o texto reconhecido nunca sai da thread (spike 294 §5, ADR 0113 §5.3). */
export type CanhotoOcrResult = Readonly<{
  ambiguous: boolean
  candidates: readonly Readonly<{ documentId: string; match: CanhotoOcrMatchKind }>[]
  markers: number
}>
