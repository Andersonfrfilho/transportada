/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 169 P2/P3: cadastrar a espécie de gasto ou receita que a operação usa, sem deploy — o
 * seletor do lançamento (trip-financials) lê o mesmo cadastro pelo lado (`expense`/`revenue`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getTripFinancialsClient } from '@/modules/trip-financials/shared/tripFinancialsClient.service'
import type { CompanyEntryKindSide } from '@/modules/trip-financials/shared/tripFinancials.types'

const COMPANY_ENTRY_KIND_CATALOG_QUERY_KEY = ['company-settings', 'entry-kinds'] as const

export function useCompanyEntryKindCatalogPanel(input: Readonly<{ enabled: boolean }>) {
  const client = getTripFinancialsClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    enabled: input.enabled,
    queryFn: () => client.readEntryKinds(),
    queryKey: COMPANY_ENTRY_KIND_CATALOG_QUERY_KEY,
  })

  const createMutation = useMutation({
    mutationFn: (fields: Readonly<{ name: string; side: CompanyEntryKindSide }>) =>
      client.createEntryKind(fields),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COMPANY_ENTRY_KIND_CATALOG_QUERY_KEY })
    },
  })

  /** Spec 169 RF6: desativar, nunca apagar — o lançamento antigo continua mostrando o nome dela. */
  const deactivateMutation = useMutation({
    mutationFn: (entryKindId: string) => client.deactivateEntryKind(entryKindId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COMPANY_ENTRY_KIND_CATALOG_QUERY_KEY })
    },
  })

  return { createMutation, deactivateMutation, query }
}
