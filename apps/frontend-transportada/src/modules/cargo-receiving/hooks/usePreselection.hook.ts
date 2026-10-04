/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect } from 'react'

import type { useAvailableDocumentsQuery } from '../queries/useAvailableDocuments.query'
import type { AvailableCargoDocument } from '../shared/cargoArrival.types'
import {
  EMPTY_DOCUMENT_SELECTION,
  selectListedDocuments,
  type SelectionChange,
} from '../shared/cargoDocumentSelection.service'

type PreselectionInput = Readonly<{
  documentsQuery: ReturnType<typeof useAvailableDocumentsQuery>
  loaded: readonly AvailableCargoDocument[]
  onResolved: (resolved: Readonly<{ change: SelectionChange; missingCount: number }>) => void
  preselectedIds: readonly string[]
  preselection: Readonly<{ isDone: boolean }>
}>

/**
 * Marca as notas que a prévia propôs. A lista de notas livres pagina de 100 em 100: enquanto faltar nota
 * proposta e houver próxima página, busca-a; esgotadas as páginas, o que não apareceu é contado como
 * "já não está livre" e fica de fora — a seleção nunca inventa uma nota que o servidor não ofereceu.
 */
export function usePreselection(input: PreselectionInput): void {
  const { documentsQuery, loaded, onResolved, preselectedIds, preselection } = input
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = documentsQuery

  useEffect(() => {
    if (preselection.isDone || preselectedIds.length === 0 || data === undefined) return
    const wanted = new Set(preselectedIds)
    const found = loaded.filter((document) => wanted.has(document.id))
    if (found.length < wanted.size && hasNextPage) {
      if (!isFetchingNextPage) void fetchNextPage()
      return
    }
    onResolved({
      change: selectListedDocuments({ documents: found, selection: EMPTY_DOCUMENT_SELECTION }),
      missingCount: wanted.size - found.length,
    })
  }, [
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    loaded,
    onResolved,
    preselectedIds,
    preselection.isDone,
  ])
}
