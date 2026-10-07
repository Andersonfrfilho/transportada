/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CargoDocumentState } from './cargoArrival.types'
import type { CargoDocumentReturn } from './cargoOccurrence.types'

export type SeparationProgress = Readonly<{ done: number; total: number }>

/**
 * Só conta o que ainda se separa: a nota marcada ("a devolver") espera o contratante e a devolvida saiu da
 * chegada, as duas fora do total. É nota a nota (não `total - devolvidas`): a nota separada e DEPOIS devolvida
 * entra em `counts.separated`, e descontá-la só do total esconderia uma nota por separar.
 */
export function resolveSeparationProgress(
  input: Readonly<{
    documents: readonly Readonly<{ nfeDocumentId: string; separationState: CargoDocumentState }>[]
    returns: ReadonlyMap<string, CargoDocumentReturn>
  }>,
): SeparationProgress {
  const separable = input.documents.filter(
    (document) =>
      (input.returns.get(document.nfeDocumentId)?.returnToContractor ?? 'none') === 'none',
  )
  return {
    done: separable.filter((document) => document.separationState === 'separated').length,
    total: separable.length,
  }
}
