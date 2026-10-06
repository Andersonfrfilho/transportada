/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getContractorDirectoryClient } from '../shared/contractorDirectoryClient.service'
import type { Contractor } from '../shared/contractorDirectory.types'

export const CONTRACTOR_DIRECTORY_QUERY_KEY = 'contractor-directory'

/** Rede de segurança contra cursor que não termina: 20 páginas de 100 são mil contratantes. */
const MAX_PAGES = 20

/**
 * A lista de contratantes é curta (uma transportadora tem poucas dezenas), e a tela busca, filtra e
 * ordena aqui — por isso carrega tudo, página a página.
 */
async function loadAllContractors(): Promise<readonly Contractor[]> {
  const client = getContractorDirectoryClient()
  const contractors: Contractor[] = []
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

export function useContractorDirectoryQuery() {
  return useQuery({
    queryFn: loadAllContractors,
    queryKey: [CONTRACTOR_DIRECTORY_QUERY_KEY, 'list'],
  })
}
