/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getContractorAutomationClient } from '../shared/contractorAutomationClient.provider'
import type {
  ContractorAutomation,
  ContractorAutomationInput,
} from '../shared/contractorAutomation.validation'

export const CONTRACTOR_AUTOMATIONS_QUERY_KEY = [
  'company-settings',
  'contractor-automations',
] as const

/** `enabled` é aba aberta **e** `settings.manage`: sem a permissão a API recusaria a leitura. */
export function useContractorAutomationsQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<readonly ContractorAutomation[]>({
    enabled: input.enabled,
    queryFn: () => getContractorAutomationClient().list(),
    queryKey: CONTRACTOR_AUTOMATIONS_QUERY_KEY,
    retry: false,
  })
}

/** Cria (sem `id`) ou edita (com `id`) — o interruptor de ligar/desligar é só mais um campo salvo. */
export function useSaveContractorAutomationMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Readonly<{ id?: string; values: ContractorAutomationInput }>) =>
      input.id === undefined
        ? getContractorAutomationClient().create(input.values)
        : getContractorAutomationClient().update(input.id, input.values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONTRACTOR_AUTOMATIONS_QUERY_KEY })
    },
  })
}
