/* Copyright (c) 2026 Ada Technology. MIT License. */
import { queryOptions, useQueries } from '@tanstack/react-query'

import type { CargoContractor } from '../shared/cargoArrival.types'
import { getCargoPreviewClient } from '../shared/cargoPreviewClient.service'
import { CARGO_RECEIVING_QUERY_KEY } from '../shared/cargoReceiving.constant'
import { useCargoContractorsQuery } from './useCargoContractors.query'

const NO_CONTRACTORS: readonly CargoContractor[] = []

function profileFlagsOptions(contractorId: string) {
  return queryOptions({
    queryFn: () => getCargoPreviewClient().readProfileFlags(contractorId),
    queryKey: [CARGO_RECEIVING_QUERY_KEY, 'preview-profile', contractorId],
  })
}

export type PreviewContractors = Readonly<{
  contractors: readonly CargoContractor[]
  isLoading: boolean
}>

/**
 * Só o contratante com o recebimento E a prévia LIGADOS pode receber planilha (a API recusa o resto com
 * 422). Não existe rota que liste os perfis de uma vez: o filtro custa uma leitura por contratante, que o
 * cache divide. Falha na leitura do perfil de um contratante o deixa de fora, nunca derruba os outros.
 */
export function usePreviewContractors(): PreviewContractors {
  const contractorsQuery = useCargoContractorsQuery()
  const all = contractorsQuery.data ?? NO_CONTRACTORS
  const eligible = useQueries({
    combine: (results) => ({
      flags: results.map((result) => result.data?.isEnabled === true && result.data.previewEnabled),
      isPending: results.some((result) => result.isPending),
    }),
    queries: all.map((contractor) => profileFlagsOptions(contractor.id)),
  })
  return {
    contractors: all.filter((_, index) => eligible.flags[index] === true),
    isLoading: contractorsQuery.isPending || eligible.isPending,
  }
}
