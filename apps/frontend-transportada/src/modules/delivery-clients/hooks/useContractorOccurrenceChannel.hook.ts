/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getContractorOccurrenceChannelClient } from '../shared/contractorOccurrenceChannelClient.service'
import type {
  ContractorOccurrenceChannel,
  ContractorOccurrenceChannelSaveBody,
} from '../shared/contractorOccurrenceChannel.types'

const CHANNEL_QUERY_KEY = 'contractor-occurrence-channel'
const GROUPS_QUERY_KEY = 'contractor-occurrence-channel-groups'

/**
 * Spec 318 T8: ler e gravar o canal do aviso de ocorrência da contratante, e mandar a mensagem de teste.
 *
 * O cliente nasce dentro de cada chamada, nunca na renderização: sem a configuração de identidade a
 * ficha abre e o bloco mostra o erro, em vez de derrubar a tela.
 */
export function useContractorOccurrenceChannel(input: Readonly<{ contractorId: string }>) {
  const queryClient = useQueryClient()
  const channelKey = [CHANNEL_QUERY_KEY, input.contractorId] as const

  const channelQuery = useQuery({
    queryFn: () => getContractorOccurrenceChannelClient().get(input.contractorId),
    queryKey: channelKey,
  })
  const saveMutation = useMutation({
    mutationFn: (body: ContractorOccurrenceChannelSaveBody) =>
      getContractorOccurrenceChannelClient().save({ body, contractorId: input.contractorId }),
    onSuccess(channel) {
      queryClient.setQueryData<ContractorOccurrenceChannel>(channelKey, channel)
      void queryClient.invalidateQueries({ queryKey: [GROUPS_QUERY_KEY] })
    },
  })
  const testMutation = useMutation({
    mutationFn: () => getContractorOccurrenceChannelClient().sendTest(input.contractorId),
  })

  return { channelQuery, saveMutation, testMutation }
}

/** A lista de grupos vai ao WhatsApp e pode demorar: só é pedida quando o canal é grupo (`enabled`). */
export function useOccurrenceChannelGroups(input: Readonly<{ enabled: boolean }>) {
  return useQuery({
    enabled: input.enabled,
    gcTime: 0,
    queryFn: () => getContractorOccurrenceChannelClient().listGroups(),
    queryKey: [GROUPS_QUERY_KEY],
  })
}
