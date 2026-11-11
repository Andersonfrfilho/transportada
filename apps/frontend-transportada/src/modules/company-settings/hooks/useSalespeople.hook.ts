/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getSalespersonClient } from '../shared/salespersonClient.provider'
import type {
  ContractorOption,
  PortfolioClient,
  Salesperson,
  SalespersonInput,
} from '../shared/salesperson.validation'

export const SALESPEOPLE_QUERY_KEY = ['company-settings', 'salespeople'] as const
const CONTRACTORS_QUERY_KEY = ['company-settings', 'salespeople', 'contractors'] as const

/** `enabled` é `settings.manage`: sem a permissão a API recusaria a leitura. */
export function useSalespeopleQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<readonly Salesperson[]>({
    enabled: input.enabled,
    queryFn: () => getSalespersonClient().list(),
    queryKey: SALESPEOPLE_QUERY_KEY,
    retry: false,
  })
}

export function useSalespersonContractorsQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<readonly ContractorOption[]>({
    enabled: input.enabled,
    queryFn: () => getSalespersonClient().listContractors(),
    queryKey: CONTRACTORS_QUERY_KEY,
    retry: false,
  })
}

export function usePortfolioQuery(
  input: Readonly<{ contractorId: string; id: string; enabled: boolean }>,
) {
  return useQuery<readonly PortfolioClient[]>({
    enabled: input.enabled,
    queryFn: () => getSalespersonClient().readPortfolio(input.id, input.contractorId),
    queryKey: [...SALESPEOPLE_QUERY_KEY, input.id, input.contractorId, 'clients'],
    retry: false,
  })
}

/** Cria (sem `id`) ou edita (com `id`); a mudança de status é só mais um campo salvo. */
export function useSaveSalespersonMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Readonly<{ id?: string; values: SalespersonInput }>) =>
      input.id === undefined
        ? getSalespersonClient().create(input.values)
        : getSalespersonClient().update(input.id, input.values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SALESPEOPLE_QUERY_KEY })
    },
  })
}

export function useLinkContractorMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Readonly<{ contractorId: string; id: string; linked: boolean }>) =>
      input.linked
        ? getSalespersonClient().link(input.id, input.contractorId)
        : getSalespersonClient().unlink(input.id, input.contractorId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SALESPEOPLE_QUERY_KEY })
    },
  })
}

export function useReplacePortfolioMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (
      input: Readonly<{ contractorId: string; id: string; taxIds: readonly string[] }>,
    ) => getSalespersonClient().replacePortfolio(input.id, input.contractorId, input.taxIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SALESPEOPLE_QUERY_KEY })
    },
  })
}
