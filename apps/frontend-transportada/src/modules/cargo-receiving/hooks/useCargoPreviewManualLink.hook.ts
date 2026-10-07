/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'

import { useAvailableDocumentsQuery } from '../queries/useAvailableDocuments.query'
import type { AvailableCargoDocument } from '../shared/cargoArrival.types'
import { filterAvailableDocuments } from '../shared/availableDocumentSearch.service'

const NO_DOCUMENTS: readonly AvailableCargoDocument[] = []

export type ManualLinkOption = Readonly<{
  document: AvailableCargoDocument
  isCandidate: boolean
}>

export type CargoPreviewManualLinkController = Readonly<{
  errorCode: string | undefined
  hasNextPage: boolean
  isLoading: boolean
  isLoadingMore: boolean
  loadMore: () => void
  options: readonly ManualLinkOption[]
  query: string
  select: (documentId: string) => void
  selected: AvailableCargoDocument | undefined
  setQuery: (query: string) => void
  totalLoaded: number
}>

/**
 * As notas livres do contratante da prévia, com busca (a lista da Fase 2). As candidatas que o vínculo
 * automático achou vêm primeiro e marcadas; a escolha é uma só, e só sai quando o operador confirma.
 */
export function useCargoPreviewManualLink(
  input: Readonly<{ candidateDocumentIds: readonly string[]; contractorId: string }>,
): CargoPreviewManualLinkController {
  const documentsQuery = useAvailableDocumentsQuery(input.contractorId)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)

  const loaded = useMemo(
    () => documentsQuery.data?.pages.flatMap((page) => page.items) ?? NO_DOCUMENTS,
    [documentsQuery.data],
  )
  const options = useMemo(() => {
    const candidates = new Set(input.candidateDocumentIds)
    const listed = filterAvailableDocuments({ documents: loaded, query }).map((document) => ({
      document,
      isCandidate: candidates.has(document.id),
    }))
    return [
      ...listed.filter((entry) => entry.isCandidate),
      ...listed.filter((entry) => !entry.isCandidate),
    ]
  }, [input.candidateDocumentIds, loaded, query])

  return {
    errorCode: documentsQuery.error instanceof Error ? documentsQuery.error.message : undefined,
    hasNextPage: documentsQuery.hasNextPage,
    isLoading: documentsQuery.isLoading,
    isLoadingMore: documentsQuery.isFetchingNextPage,
    loadMore: () => void documentsQuery.fetchNextPage(),
    options,
    query,
    select: setSelectedId,
    selected: loaded.find((document) => document.id === selectedId),
    setQuery,
    totalLoaded: loaded.length,
  }
}
