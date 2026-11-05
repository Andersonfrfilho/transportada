/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF26: o canhoto repetido não grava duas vezes.
 */

/** O canhoto que já existe com a mesma imagem (hash do conteúdo), na mesma empresa. */
export type AttachedCanhoto = {
  readonly attachedAt: Date
  readonly documentId: string
  readonly proofId: string
}

/** O que a resposta diz quando o canhoto repetido não foi gravado: a nota e a hora em que ele já tinha chegado. */
export type CanhotoDuplicate = {
  readonly attachedAt: Date
  readonly documentId: string
}
