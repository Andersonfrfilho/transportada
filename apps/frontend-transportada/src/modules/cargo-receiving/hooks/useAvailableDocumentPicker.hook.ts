/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'

import { useAvailableDocumentsQuery } from '../queries/useAvailableDocuments.query'
import type { AvailableCargoDocument } from '../shared/cargoArrival.types'
import {
  clearListedDocuments,
  EMPTY_DOCUMENT_SELECTION,
  resolveSelectAllState,
  selectListedDocuments,
  toggleDocumentSelection,
  type DocumentSelection,
  type SelectAllState,
} from '../shared/cargoDocumentSelection.service'
import { filterAvailableDocuments } from '../shared/availableDocumentSearch.service'
import { usePreselection } from './usePreselection.hook'

const NO_DOCUMENTS: readonly AvailableCargoDocument[] = []
const NO_PRESELECTED_IDS: readonly string[] = []

export type AvailableDocumentPickerController = Readonly<{
  clearSelection: () => void
  errorCode: string | undefined
  hasNextPage: boolean
  isLimited: boolean
  isLoading: boolean
  isLoadingMore: boolean
  listed: readonly AvailableCargoDocument[]
  loadMore: () => void
  /** Notas que a prévia propôs e que já não estão livres: ficaram de fora da seleção. */
  missingPreselectedCount: number
  query: string
  selectAllState: SelectAllState
  selection: DocumentSelection
  setQuery: (query: string) => void
  toggleAll: () => void
  toggleDocument: (document: AvailableCargoDocument) => void
  totalLoaded: number
}>

/** Seleção, busca e páginas das notas livres de um contratante. Trocar de contratante recomeça a seleção. */
export function useAvailableDocumentPicker(
  contractorId: string,
  preselectedIds: readonly string[] = NO_PRESELECTED_IDS,
): AvailableDocumentPickerController {
  const documentsQuery = useAvailableDocumentsQuery(contractorId)
  const [selectionState, setSelectionState] = useState<{
    contractorId: string
    isLimited: boolean
    selection: DocumentSelection
  }>({ contractorId, isLimited: false, selection: EMPTY_DOCUMENT_SELECTION })
  const [query, setQuery] = useState('')
  const [preselection, setPreselection] = useState({ isDone: false, missingCount: 0 })

  const loaded = useMemo(
    () => documentsQuery.data?.pages.flatMap((page) => page.items) ?? NO_DOCUMENTS,
    [documentsQuery.data],
  )
  const listed = useMemo(
    () => filterAvailableDocuments({ documents: loaded, query }),
    [loaded, query],
  )
  usePreselection({
    documentsQuery,
    loaded,
    onResolved: (resolved) => {
      setSelectionState({ contractorId, ...resolved.change })
      setPreselection({ isDone: true, missingCount: resolved.missingCount })
    },
    preselectedIds,
    preselection,
  })
  const isCurrent = selectionState.contractorId === contractorId
  const selection = isCurrent ? selectionState.selection : EMPTY_DOCUMENT_SELECTION
  const selectAllState = resolveSelectAllState({ documents: listed, selection })

  function commit(next: Readonly<{ isLimited: boolean; selection: DocumentSelection }>): void {
    setSelectionState({ contractorId, ...next })
  }

  return {
    clearSelection: () => commit({ isLimited: false, selection: EMPTY_DOCUMENT_SELECTION }),
    errorCode: documentsQuery.error instanceof Error ? documentsQuery.error.message : undefined,
    hasNextPage: documentsQuery.hasNextPage,
    isLimited: isCurrent && selectionState.isLimited,
    isLoading: documentsQuery.isLoading,
    isLoadingMore: documentsQuery.isFetchingNextPage,
    listed,
    loadMore: () => void documentsQuery.fetchNextPage(),
    missingPreselectedCount: preselection.missingCount,
    query,
    selectAllState,
    selection,
    setQuery,
    toggleAll: () =>
      selectAllState === 'all'
        ? commit({
            isLimited: false,
            selection: clearListedDocuments({ documents: listed, selection }),
          })
        : commit(selectListedDocuments({ documents: listed, selection })),
    toggleDocument: (document) => commit(toggleDocumentSelection({ document, selection })),
    totalLoaded: loaded.length,
  }
}
