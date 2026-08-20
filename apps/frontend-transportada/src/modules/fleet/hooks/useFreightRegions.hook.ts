/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { FLEET_PAGE_SIZE, FREIGHT_REGION_LOAD_LIMIT } from '../shared/fleet.constant'
import type {
  FreightRegion,
  FreightRegionBodyInput,
  FreightRegionPage,
  FreightRegionUpdateInput,
} from '../shared/freightRegion.types'
import { getFleetClient } from './useFleet.hook'

const FREIGHT_REGIONS_QUERY_KEY = 'freight-regions'

type ListFreightRegionPage = (
  input: Readonly<{ cursor: null | string; limit: number }>,
) => Promise<FreightRegionPage>

/**
 * A tabela ordena e filtra sobre a tabela de frete inteira, então ela precisa da tabela inteira:
 * com uma página só, "ordenar pelo valor do truck" ordenaria as 25 primeiras rotas e mentiria sobre
 * o resto. O teto existe para cursor que não anda não virar laço infinito.
 */
export async function loadEveryFreightRegion(
  listPage: ListFreightRegionPage,
): Promise<readonly FreightRegion[]> {
  const items: FreightRegion[] = []
  let cursor: null | string = null

  do {
    const page: FreightRegionPage = await listPage({ cursor, limit: FLEET_PAGE_SIZE })
    items.push(...page.items)
    cursor = page.nextCursor
  } while (cursor !== null && items.length < FREIGHT_REGION_LOAD_LIMIT)

  return items
}

export function useFreightRegions(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const client = getFleetClient()
  const queryClient = useQueryClient()
  const queryKey = [FREIGHT_REGIONS_QUERY_KEY, input.companyId] as const
  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: () => loadEveryFreightRegion((page) => client.listFreightRegions(page)),
    queryKey,
  })

  /**
   * A consulta guarda a tabela de frete inteira, e é o servidor que deriva `zone` do código e a
   * ordem em que a rota entra: escrever a linha na mão obrigaria a reproduzir as duas coisas aqui.
   */
  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey })
  }

  const createMutation = useMutation({
    mutationFn: (body: FreightRegionBodyInput) => client.createFreightRegion(body),
    onSuccess: invalidate,
  })

  const updateMutation = useMutation({
    mutationFn: (body: FreightRegionUpdateInput) => client.updateFreightRegion(body),
    onSuccess: invalidate,
  })

  return { createMutation, query, updateMutation }
}
