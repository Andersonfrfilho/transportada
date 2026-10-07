/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2 (ADR-0094 §9.1, R3): a NF-e de uma ocorrência de nota é a da nota da viagem OU a da
 * nota da chegada (a avaria sem viagem) — o CHECK de dono garante que só uma das duas existe. Uma
 * expressão só para as quatro leituras do portal; as duas junções à esquerda que a alimentam levam a
 * empresa da OCORRÊNCIA, nunca a da tabela juntada.
 */
import { sql, type AnyColumn, type SQL } from 'drizzle-orm'

export function occurrenceNfeDocumentId(documents: {
  readonly arrivalDocument: { readonly nfeDocumentId: AnyColumn }
  readonly tripDocument: { readonly nfeDocumentId: AnyColumn }
}): SQL<string> {
  return sql<string>`coalesce(${documents.tripDocument.nfeDocumentId}, ${documents.arrivalDocument.nfeDocumentId})`
}
