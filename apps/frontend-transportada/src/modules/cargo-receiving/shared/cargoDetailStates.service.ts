/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CargoArrivalDetail,
  CargoArrivalDocument,
  CargoArrivalGroup,
  CargoDocumentState,
  CargoStateCounts,
} from './cargoArrival.types'

/** O estado de cada nota, por id da NF-e: é o que a atualização otimista grava e o que a volta restaura. */
export type DocumentStates = Readonly<Record<string, CargoDocumentState>>

function countStates(documents: readonly CargoArrivalDocument[]): CargoStateCounts {
  const counts = { expected: 0, received: 0, separated: 0, total: documents.length }
  for (const document of documents) counts[document.separationState] += 1
  return counts
}

function applyToGroup(group: CargoArrivalGroup, states: DocumentStates): CargoArrivalGroup {
  const documents = group.documents.map((document) => {
    const next = states[document.nfeDocumentId]
    return next === undefined || next === document.separationState
      ? document
      : { ...document, separationState: next }
  })
  return { ...group, counts: countStates(documents), documents }
}

/** Troca o estado das notas e recalcula as contagens do grupo e da chegada, sem tocar na original. */
export function applyDocumentStates(
  input: Readonly<{ detail: CargoArrivalDetail; states: DocumentStates }>,
): CargoArrivalDetail {
  const groups = input.detail.groups.map((group) => applyToGroup(group, input.states))
  return {
    ...input.detail,
    counts: countStates(groups.flatMap((group) => group.documents)),
    groups,
  }
}

export function readDocumentStates(
  input: Readonly<{ detail: CargoArrivalDetail; documentIds: readonly string[] }>,
): DocumentStates {
  const wanted = new Set(input.documentIds)
  return Object.fromEntries(
    input.detail.groups
      .flatMap((group) => group.documents)
      .filter((document) => wanted.has(document.nfeDocumentId))
      .map((document) => [document.nfeDocumentId, document.separationState]),
  )
}
