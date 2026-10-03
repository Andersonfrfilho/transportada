/* Copyright (c) 2026 Ada Technology. MIT License. */
import { queryOptions, useQueries, useQuery } from '@tanstack/react-query'

import type { CargoContractor } from '../shared/cargoArrival.types'
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

function receivingEnabledOptions(contractorId: string) {
  return queryOptions({
    queryFn: () => getCargoReceivingClient().readReceivingEnabled(contractorId),
    queryKey: [CARGO_RECEIVING_QUERY_KEY, 'receiving-enabled', contractorId],
  })
}

export type EnabledContractors = Readonly<{
  contractors: readonly CargoContractor[]
  isLoading: boolean
}>

/**
 * Só o contratante com o recebimento LIGADO pode ter chegada (a API recusa o resto com 422). Não existe
 * rota que liste os perfis de uma vez: o filtro custa uma leitura por contratante, que o cache divide.
 * Falha na leitura do perfil de um contratante o deixa de fora, nunca derruba a lista dos outros.
 */
export function useEnabledContractors(): EnabledContractors {
  const contractorsQuery = useCargoContractorsQuery()
  const all = contractorsQuery.data ?? NO_CONTRACTORS
  const enabled = useQueries({
    combine: (results) => ({
      isPending: results.some((result) => result.isPending),
      flags: results.map((result) => result.data === true),
    }),
    queries: all.map((contractor) => receivingEnabledOptions(contractor.id)),
  })
  return {
    contractors: all.filter((_, index) => enabled.flags[index] === true),
    isLoading: contractorsQuery.isPending || enabled.isPending,
  }
}
