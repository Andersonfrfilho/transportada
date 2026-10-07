/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AvailableCargoDocument } from './cargoArrival.types'
import { CARGO_ARRIVAL_LIMITS } from './cargoReceiving.constant'

/**
 * As notas marcadas guardam o documento inteiro: a recusa do servidor precisa do número da nota, e a
 * nota marcada numa busca pode já não estar na lista de outra. A ordem de inserção é a ordem do pedido.
 */
export type DocumentSelection = ReadonlyMap<string, AvailableCargoDocument>

export type SelectionChange = Readonly<{
  /** Alguma nota não entrou porque o teto de uma chegada (300) foi atingido. */
  isLimited: boolean
  selection: DocumentSelection
}>

export type SelectAllState = 'all' | 'none' | 'some'

export const EMPTY_DOCUMENT_SELECTION: DocumentSelection = new Map()

const LIMIT = CARGO_ARRIVAL_LIMITS.documentsPerRequest

export function toggleDocumentSelection(
  input: Readonly<{ document: AvailableCargoDocument; selection: DocumentSelection }>,
): SelectionChange {
  const next = new Map(input.selection)
  if (next.delete(input.document.id)) return { isLimited: false, selection: next }
  if (next.size >= LIMIT) return { isLimited: true, selection: input.selection }
  next.set(input.document.id, input.document)
  return { isLimited: false, selection: next }
}

/** Acrescenta as listadas até o limite; as que já estavam marcadas não contam duas vezes. */
export function selectListedDocuments(
  input: Readonly<{ documents: readonly AvailableCargoDocument[]; selection: DocumentSelection }>,
): SelectionChange {
  const next = new Map(input.selection)
  let isLimited = false
  for (const document of input.documents) {
    if (next.has(document.id)) continue
    if (next.size >= LIMIT) {
      isLimited = true
      break
    }
    next.set(document.id, document)
  }
  return { isLimited, selection: next }
}

/** Tira só as listadas: o que foi marcado numa busca anterior continua marcado. */
export function clearListedDocuments(
  input: Readonly<{ documents: readonly AvailableCargoDocument[]; selection: DocumentSelection }>,
): DocumentSelection {
  const listed = new Set(input.documents.map((document) => document.id))
  return new Map([...input.selection].filter(([id]) => !listed.has(id)))
}

export function resolveSelectAllState(
  input: Readonly<{ documents: readonly AvailableCargoDocument[]; selection: DocumentSelection }>,
): SelectAllState {
  const selectedCount = input.documents.filter((document) =>
    input.selection.has(document.id),
  ).length
  if (selectedCount === 0) return 'none'
  return selectedCount === input.documents.length ? 'all' : 'some'
}
