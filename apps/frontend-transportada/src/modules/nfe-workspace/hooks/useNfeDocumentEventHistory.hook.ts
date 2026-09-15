/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createNfeDocumentEventClient,
  type NfeDocumentEventClient,
  type NfeDocumentEventEntry,
  type NfeDocumentEventPage,
} from '../shared/nfeDocumentEventClient.service'

export const NFE_DOCUMENT_EVENTS_QUERY_KEY = 'nfe-document-events'
export const NFE_DOCUMENT_EVENTS_PAGE_SIZE = 20

/** Alvo do drawer: o que a linha já tem em mãos, sem esperar a primeira página para exibir o título. */
export type NfeDocumentEventHistoryTarget = Readonly<{
  documentId: string
  number: string
  series: string
}>

export function getNfeDocumentEventClient(): NfeDocumentEventClient {
  return createNfeDocumentEventClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

function readErrorCode(error: unknown): null | string {
  return error instanceof Error ? error.message : null
}

export type UseNfeDocumentEventHistoryInput = Readonly<{
  companyId?: string
}>

export function useNfeDocumentEventHistory(input: UseNfeDocumentEventHistoryInput) {
  const [target, setTarget] = useState<NfeDocumentEventHistoryTarget | null>(null)
  const client = getNfeDocumentEventClient()
  const documentId = target?.documentId ?? null

  const query = useInfiniteQuery({
    enabled: documentId !== null,
    getNextPageParam: (lastPage: NfeDocumentEventPage) => lastPage.nextCursor,
    initialPageParam: null as null | string,
    queryFn: ({ pageParam }) =>
      client.listDocumentEvents({
        cursor: pageParam,
        documentId: documentId ?? '',
        limit: NFE_DOCUMENT_EVENTS_PAGE_SIZE,
      }),
    queryKey: [NFE_DOCUMENT_EVENTS_QUERY_KEY, input.companyId, documentId] as const,
  })

  const entries: readonly NfeDocumentEventEntry[] =
    query.data?.pages.flatMap((page) => page.items) ?? []

  return {
    close: () => setTarget(null),
    entries,
    errorCode: readErrorCode(query.error),
    fetchNextPage: () => {
      void query.fetchNextPage()
    },
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    open: (openTarget: NfeDocumentEventHistoryTarget) => setTarget(openTarget),
    target,
  }
}

export type NfeDocumentEventHistoryController = ReturnType<typeof useNfeDocumentEventHistory>
