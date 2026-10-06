/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CargoContractor } from '../shared/cargoArrival.types'
import { useCargoContractorsQuery, useEnabledProfilesQuery } from './useCargoContractors.query'

const NO_CONTRACTORS: readonly CargoContractor[] = []

export type PreviewContractors = Readonly<{
  contractors: readonly CargoContractor[]
  isLoading: boolean
}>

/**
 * Só o contratante com o recebimento E a prévia LIGADOS pode receber planilha (a API recusa o resto com
 * 422). Os perfis ligados vêm numa consulta paginada, a mesma do registro de chegada, e se cruzam com os
 * contratantes por `contractorId`: o número de requisições não cresce com o de contratantes.
 */
export function usePreviewContractors(): PreviewContractors {
  const contractorsQuery = useCargoContractorsQuery()
  const profilesQuery = useEnabledProfilesQuery()
  const eligibleIds = new Set(
    (profilesQuery.data ?? [])
      .filter((profile) => profile.isEnabled && profile.previewEnabled)
      .map((profile) => profile.contractorId),
  )
  return {
    contractors: (contractorsQuery.data ?? NO_CONTRACTORS).filter((contractor) =>
      eligibleIds.has(contractor.id),
    ),
    isLoading: contractorsQuery.isPending || profilesQuery.isPending,
  }
}
