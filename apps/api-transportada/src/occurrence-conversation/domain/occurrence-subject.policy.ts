/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 (ADR-0101): `occurrence_kind` e `occurrence_id` aceitam nulo desde a conversa de nota e de
 * viagem. As consultas da contratante e da ocorrência já filtram por ocorrência; aqui o tipo estreita.
 */
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'

const MISSING_OCCURRENCE_SUBJECT_MESSAGE = 'occurrence conversation row has no occurrence subject'

type OccurrenceSubjectColumns = {
  readonly occurrenceId: null | string
  readonly occurrenceKind: null | OccurrenceConversationKind
}

/** O CHECK de forma garante `occurrence_*` na conversa de ocorrência; sem elas, o filtro da consulta falhou. */
export function requireOccurrenceSubject<TRow extends OccurrenceSubjectColumns>(
  row: TRow,
): Omit<TRow, keyof OccurrenceSubjectColumns> & {
  readonly occurrenceId: string
  readonly occurrenceKind: OccurrenceConversationKind
} {
  const { occurrenceId, occurrenceKind, ...rest } = row
  if (occurrenceId === null || occurrenceKind === null) {
    throw new Error(MISSING_OCCURRENCE_SUBJECT_MESSAGE)
  }
  return { ...rest, occurrenceId, occurrenceKind }
}

/** Para a consulta que só lê `occurrence_id` (lista do motorista, já filtrada por ocorrência). */
export function requireOccurrenceId(occurrenceId: null | string): string {
  if (occurrenceId === null) throw new Error(MISSING_OCCURRENCE_SUBJECT_MESSAGE)
  return occurrenceId
}
