/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type { ContractorSummary } from '../shared/contractorSummary.service'

const CONTRACTORS_QUERY_KEY = ['trip', 'contractors'] as const

/**
 * Spec 218 (T10/T11/T14): a mesma consulta que `OccurrenceTypeCatalogPanel` já importa de `trip`
 * para o catálogo de ocorrência — o seletor de contratante das telas de exceção reaproveita aqui,
 * em vez de cruzar para o módulo `delivery-clients` (`web.md` §1).
 */
export function useContractorsQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<readonly ContractorSummary[]>({
    enabled: input.enabled,
    queryFn: () => getTripClient().listContractors(),
    queryKey: CONTRACTORS_QUERY_KEY,
  })
}
