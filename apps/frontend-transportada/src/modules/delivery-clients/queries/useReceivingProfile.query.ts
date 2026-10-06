/* Copyright (c) 2026 Ada Technology. MIT License. */
import { queryOptions, useQueries, useQuery } from '@tanstack/react-query'

import { getContractorDirectoryClient } from '../shared/contractorDirectoryClient.service'
import type { ReceivingProfile } from '../shared/receivingProfile.types'
import { CONTRACTOR_DIRECTORY_QUERY_KEY } from './useContractorDirectory.query'

export function receivingProfileQueryKey(contractorId: string) {
  return [CONTRACTOR_DIRECTORY_QUERY_KEY, 'receiving-profile', contractorId] as const
}

/** Uma só definição: o selo da lista e a ficha leem a mesma chave e dividem a mesma busca. */
function receivingProfileQueryOptions(contractorId: string) {
  return queryOptions({
    queryFn: () => getContractorDirectoryClient().getReceivingProfile(contractorId),
    queryKey: receivingProfileQueryKey(contractorId),
  })
}

export function useReceivingProfileQuery(contractorId: string) {
  return useQuery(receivingProfileQueryOptions(contractorId))
}

export type ReceivingProfileSummary =
  | Readonly<{ state: 'error' }>
  | Readonly<{ state: 'loading' }>
  | Readonly<{ profile: ReceivingProfile | null; state: 'ready' }>

/**
 * Não há rota que liste os perfis de uma vez: o selo de cada linha é uma leitura por contratante.
 * É o preço de a API do perfil ser por contratante; uma rota em lote resolveria, e é pedido à parte.
 */
export function useReceivingProfileSummaries(
  contractorIds: readonly string[],
): ReadonlyMap<string, ReceivingProfileSummary> {
  return useQueries({
    combine: (results) =>
      new Map<string, ReceivingProfileSummary>(
        contractorIds.map((contractorId, index) => {
          const result = results[index]
          if (result === undefined || result.isPending) {
            return [contractorId, { state: 'loading' }]
          }
          if (result.isError) return [contractorId, { state: 'error' }]
          return [contractorId, { profile: result.data ?? null, state: 'ready' }]
        }),
      ),
    queries: contractorIds.map(receivingProfileQueryOptions),
  })
}
