/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createAggregateDocumentClient } from '../shared/aggregateDocumentClient.service'

const AGGREGATE_DOCUMENTS_QUERY_KEY = 'aggregate-documents'

function getAggregateDocumentClient() {
  return createAggregateDocumentClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useAggregateDocuments(input: Readonly<{ enabled: boolean }>) {
  const client = getAggregateDocumentClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    enabled: input.enabled,
    queryFn: client.list,
    queryKey: [AGGREGATE_DOCUMENTS_QUERY_KEY],
  })

  const reviewMutation = useMutation({
    mutationFn: client.review,
    onSuccess: () =>
      queryClient
        .invalidateQueries({ queryKey: [AGGREGATE_DOCUMENTS_QUERY_KEY] })
        .then(() => undefined),
  })

  return { getDownloadUrl: client.getDownloadUrl, query, reviewMutation }
}
