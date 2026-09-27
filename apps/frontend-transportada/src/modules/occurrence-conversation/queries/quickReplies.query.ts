/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import type { QuickReplyAudience } from '../shared/occurrenceConversation.types'
import {
  createQuickRepliesClient,
  type QuickRepliesClient,
} from '../shared/quickRepliesClient.service'

export const QUICK_REPLIES_QUERY_KEY = 'occurrence-quick-replies'

function getQuickRepliesClient(): QuickRepliesClient {
  return createQuickRepliesClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/** O cadastro inteiro, as duas abas — só na aba de Configurações. */
export function useQuickRepliesQuery(input: Readonly<{ enabled: boolean }>) {
  const client = getQuickRepliesClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.listAll(),
    queryKey: [QUICK_REPLIES_QUERY_KEY, 'all'],
  })
}

/** As ativas de um público, para o compositor daquela aba. */
export function useComposerQuickRepliesQuery(audience: QuickReplyAudience) {
  const client = getQuickRepliesClient()
  return useQuery({
    queryFn: () => client.listForComposer(audience),
    queryKey: [QUICK_REPLIES_QUERY_KEY, 'composer', audience],
  })
}

/** Toda escrita do cadastro volta a ler as duas listas: a tela e os compositores. */
export function useQuickReplyMutations() {
  const queryClient = useQueryClient()
  const client = getQuickRepliesClient()
  const onSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: [QUICK_REPLIES_QUERY_KEY] })
  }
  return {
    create: useMutation({ mutationFn: client.create, onSuccess }),
    reorder: useMutation({ mutationFn: client.reorder, onSuccess }),
    update: useMutation({ mutationFn: client.update, onSuccess }),
  }
}
