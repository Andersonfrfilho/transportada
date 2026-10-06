/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { RECEIVING_PROFILES_QUERY_KEY } from '@/modules/shared/receivingProfileQueryKey.constant'

import type { CargoContractor, CargoReceivingProfile } from '../shared/cargoArrival.types'
import { CARGO_RECEIVING_QUERY_KEY } from '../shared/cargoReceiving.constant'
import { getCargoReceivingClient } from '../shared/cargoReceivingClient.service'

/** Rede de segurança contra cursor que não termina: 20 páginas de 100 são dois mil contratantes. */
const MAX_PAGES = 20
const NO_CONTRACTORS: readonly CargoContractor[] = []

/** Uma transportadora tem poucas dezenas de contratantes: a tela filtra e escolhe aqui, página a página. */
async function loadAllContractors(): Promise<readonly CargoContractor[]> {
  const client = getCargoReceivingClient()
  const contractors: CargoContractor[] = []
  let cursor: string | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // O cursor da próxima página só existe depois da resposta desta: não há o que paralelizar.
    const result = await client.listContractors({ cursor })
    contractors.push(...result.items)
    if (result.nextCursor === null) break
    cursor = result.nextCursor
  }
  return contractors
}

export function useCargoContractorsQuery() {
  return useQuery({
    queryFn: loadAllContractors,
    queryKey: [CARGO_RECEIVING_QUERY_KEY, 'contractors'],
  })
}

/** Só quem tem o recebimento LIGADO: uma consulta paginada, no lugar de uma leitura por contratante. */
async function loadEnabledProfiles(): Promise<readonly CargoReceivingProfile[]> {
  const client = getCargoReceivingClient()
  const profiles: CargoReceivingProfile[] = []
  let cursor: string | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // O cursor da próxima página só existe depois da resposta desta: não há o que paralelizar.
    const result = await client.listReceivingProfiles({ cursor, enabled: true })
    profiles.push(...result.items)
    if (result.nextCursor === null) break
    cursor = result.nextCursor
  }
  return profiles
}

export function useEnabledProfilesQuery() {
  return useQuery({
    queryFn: loadEnabledProfiles,
    queryKey: [RECEIVING_PROFILES_QUERY_KEY, 'cargo-receiving-enabled'],
  })
}

export type EnabledContractors = Readonly<{
  contractors: readonly CargoContractor[]
  isLoading: boolean
}>

/**
 * Só o contratante com o recebimento LIGADO pode ter chegada (a API recusa o resto com 422). A lista de
 * perfis ligados e a de contratantes se cruzam por `contractorId`: o número de requisições depende das
 * páginas, nunca de quantos contratantes existem.
 */
export function useEnabledContractors(): EnabledContractors {
  const contractorsQuery = useCargoContractorsQuery()
  const profilesQuery = useEnabledProfilesQuery()
  const enabledIds = new Set((profilesQuery.data ?? []).map((profile) => profile.contractorId))
  return {
    contractors: (contractorsQuery.data ?? NO_CONTRACTORS).filter((contractor) =>
      enabledIds.has(contractor.id),
    ),
    isLoading: contractorsQuery.isPending || profilesQuery.isPending,
  }
}
