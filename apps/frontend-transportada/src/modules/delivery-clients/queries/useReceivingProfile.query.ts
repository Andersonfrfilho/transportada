/* Copyright (c) 2026 Ada Technology. MIT License. */
import { queryOptions, useQuery } from '@tanstack/react-query'

import { RECEIVING_PROFILES_QUERY_KEY } from '@/modules/shared/receivingProfileQueryKey.constant'

import { getContractorDirectoryClient } from '../shared/contractorDirectoryClient.service'
import type { ReceivingProfileListItem } from '../shared/receivingProfile.types'
import { CONTRACTOR_DIRECTORY_QUERY_KEY } from './useContractorDirectory.query'

export function receivingProfileQueryKey(contractorId: string) {
  return [CONTRACTOR_DIRECTORY_QUERY_KEY, 'receiving-profile', contractorId] as const
}

/** A ficha lê o perfil COMPLETO do contratante aberto; o selo da lista vem da lista de perfis (abaixo). */
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
  | Readonly<{ profile: ReceivingProfileListItem | null; state: 'ready' }>

/** Rede de segurança contra cursor que não termina: 20 páginas de 100 são dois mil perfis. */
const MAX_PAGES = 20
const NO_PROFILES: readonly ReceivingProfileListItem[] = []

async function loadAllProfiles(): Promise<readonly ReceivingProfileListItem[]> {
  const client = getContractorDirectoryClient()
  const profiles: ReceivingProfileListItem[] = []
  let cursor: string | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // O cursor da próxima página só existe depois da resposta desta: não há o que paralelizar.
    const result = await client.listReceivingProfiles({ cursor })
    profiles.push(...result.items)
    if (result.nextCursor === null) break
    cursor = result.nextCursor
  }
  return profiles
}

/**
 * O selo de cada linha vem de UMA consulta paginada de perfis, não de uma leitura por contratante: o
 * número de requisições segue as páginas, nunca o número de contratantes. Contratante que não aparece na
 * lista não tem perfil.
 */
export function useReceivingProfileSummaries(
  contractorIds: readonly string[],
): ReadonlyMap<string, ReceivingProfileSummary> {
  const query = useQuery({
    queryFn: loadAllProfiles,
    queryKey: [RECEIVING_PROFILES_QUERY_KEY, 'contractor-directory'],
  })
  const profiles = new Map((query.data ?? NO_PROFILES).map((item) => [item.contractorId, item]))
  return new Map<string, ReceivingProfileSummary>(
    contractorIds.map((contractorId) => {
      if (query.isError) return [contractorId, { state: 'error' }]
      if (query.isPending) return [contractorId, { state: 'loading' }]
      return [contractorId, { profile: profiles.get(contractorId) ?? null, state: 'ready' }]
    }),
  )
}
