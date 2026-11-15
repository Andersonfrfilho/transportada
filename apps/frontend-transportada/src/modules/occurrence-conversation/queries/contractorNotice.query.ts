/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { TRIP_OCCURRENCE_FEED_QUERY_KEY } from '@/modules/trip/queries/tripOccurrenceFeed.query'

import { getContractorNoticeClient } from '../shared/contractorNoticeClient.provider'
import { OCCURRENCE_CONVERSATIONS_QUERY_KEY } from './occurrenceConversation.query'

export const CONTRACTOR_NOTICE_QUERY_KEY = 'contractor-notice'

/** Spec 324 T4: o estado do botão; o canal pode mudar entre abrir e confirmar, então sempre relê ao montar. */
export function useContractorNoticeStateQuery(
  input: Readonly<{ enabled: boolean; occurrenceId: string }>,
) {
  const client = getContractorNoticeClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.readContractorNoticeState({ occurrenceId: input.occurrenceId }),
    queryKey: [CONTRACTOR_NOTICE_QUERY_KEY, input.occurrenceId],
    staleTime: 0,
  })
}

export function useSendContractorNoticeMutation(occurrenceId: string) {
  const queryClient = useQueryClient()
  const client = getContractorNoticeClient()
  return useMutation({
    mutationFn: () => client.sendContractorNotice({ occurrenceId }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [CONTRACTOR_NOTICE_QUERY_KEY, occurrenceId] })
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_CONVERSATIONS_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TRIP_OCCURRENCE_FEED_QUERY_KEY] })
    },
  })
}
