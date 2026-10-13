/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from '@/modules/trip/queries/tripOccurrenceFeed.query'

import {
  createContractorReplyClient,
  type ContractorReplyClient,
} from '../shared/contractorReplyClient.service'
import {
  CONTRACTOR_REPLY_QUERY_KEY,
  OCCURRENCE_CONVERSATIONS_QUERY_KEY,
} from './occurrenceConversation.query'

/** O prazo e o alarme andam sozinhos no servidor: um minuto basta para o painel não ficar velho. */
const CONTRACTOR_REPLY_REFETCH_MS = 60_000

function getContractorReplyClient(): ContractorReplyClient {
  return createContractorReplyClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useContractorReplyQuery(
  input: Readonly<{ companyId?: string; enabled: boolean; occurrenceId: string }>,
) {
  const client = getContractorReplyClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.readReply({ occurrenceId: input.occurrenceId }),
    queryKey: [CONTRACTOR_REPLY_QUERY_KEY, input.companyId, input.occurrenceId],
    refetchInterval: CONTRACTOR_REPLY_REFETCH_MS,
  })
}

/** O retorno mexe no selo da lista; entregar ao motorista mexe também na conversa dele. */
function useRefreshAfterReplyChange() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: [CONTRACTOR_REPLY_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
    void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
  }
}

export function useMarkContractorReplyHandledMutation(occurrenceId: string) {
  const client = getContractorReplyClient()
  const refresh = useRefreshAfterReplyChange()
  return useMutation({
    mutationFn: (note: string) => client.markHandled({ note, occurrenceId }),
    onSuccess: refresh,
  })
}
