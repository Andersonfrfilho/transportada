/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createCteBatchItemClient,
  type CteBatchItemClient,
} from '../shared/cteBatchItemClient.service'
import {
  serializeCteItemQuery,
  serializeCteItemSummaryQuery,
  type CteItemTableFilters,
} from '../shared/cteBatchItemTable.service'
import {
  resolveCteItemProgressInterval,
  resolveCteItemSummaryInterval,
} from '../shared/cteBatchProgress.service'

export const COMPANY_CTE_ITEMS_QUERY_KEY = 'company-cte-items'
export const COMPANY_CTE_ITEM_SUMMARY_QUERY_KEY = 'company-cte-item-summary'

export type UseCompanyCteItemSummaryInput = Readonly<{
  batchIdIn?: readonly string[]
  companyId?: string
  enabled: boolean
  filters?: CteItemTableFilters
}>

export type UseCompanyCteItemsInput = Readonly<{
  companyId?: string
  cursor: null | string
  enabled: boolean
  filters: CteItemTableFilters
  limit: number
}>

export function getCteBatchItemClient(): CteBatchItemClient {
  return createCteBatchItemClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * A página mostra 25 linhas e não diz nada sobre as outras; o recorte inteiro é somado no banco.
 * Sem `batchIdIn` nem filtros o resumo cobre a empresa toda — é isso que a aba Lotes usa.
 */
export function useCompanyCteItemSummaryQuery(input: UseCompanyCteItemSummaryInput) {
  const client = getCteBatchItemClient()
  const request = {
    ...(input.batchIdIn === undefined ? {} : { batchIdIn: input.batchIdIn }),
    ...(input.filters === undefined ? {} : { filters: input.filters }),
  }

  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.summarizeCompanyItems(request),
    queryKey: [
      COMPANY_CTE_ITEM_SUMMARY_QUERY_KEY,
      input.companyId,
      serializeCteItemSummaryQuery(request),
    ],
    refetchInterval: (query) => resolveCteItemSummaryInterval(query.state.data),
  })
}

export function useCompanyCteItemsQuery(input: UseCompanyCteItemsInput) {
  const client = getCteBatchItemClient()
  const request = { cursor: input.cursor, filters: input.filters, limit: input.limit }

  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.listCompanyItems(request),
    queryKey: [COMPANY_CTE_ITEMS_QUERY_KEY, input.companyId, serializeCteItemQuery(request)],
    /** CT-e em voo muda de status pelo worker — a listagem relê até a última tentativa fechar. */
    refetchInterval: (query) => resolveCteItemProgressInterval(query.state.data),
  })
}
