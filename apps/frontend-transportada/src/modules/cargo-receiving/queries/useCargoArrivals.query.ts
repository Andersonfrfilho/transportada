/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CargoArrivalFilters,
  CargoArrivalSummary,
  CargoPage,
} from '../shared/cargoArrival.types'
import { resolveCargoArrivalRefetchInterval } from '../shared/cargoArrivalPolling.service'
import { CARGO_RECEIVING_QUERY_KEY } from '../shared/cargoReceiving.constant'
import { getCargoReceivingClient } from '../shared/cargoReceivingClient.service'

export const CARGO_ARRIVALS_LIST_KEY = [CARGO_RECEIVING_QUERY_KEY, 'arrivals'] as const

export function cargoArrivalDetailQueryKey(arrivalId: string) {
  return [CARGO_RECEIVING_QUERY_KEY, 'arrival', arrivalId] as const
}

export function cargoArrivalsQueryKey(filters: CargoArrivalFilters) {
  return [...CARGO_ARRIVALS_LIST_KEY, filters] as const
}

/** Acumula as páginas por cursor: "carregar mais" soma à lista, nunca a troca (`web.md` §7). */
export function useCargoArrivalsQuery(filters: CargoArrivalFilters) {
  return useInfiniteQuery({
    getNextPageParam: (page: CargoPage<CargoArrivalSummary>) => page.nextCursor,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getCargoReceivingClient().listArrivals({ cursor: pageParam, filters }),
    queryKey: cargoArrivalsQueryKey(filters),
  })
}

/** A chave do toque da separação: é por ela que a leitura periódica sabe que há um toque meu em voo. */
export function cargoArrivalTouchMutationKey(arrivalId: string) {
  return [...cargoArrivalDetailQueryKey(arrivalId), 'touch'] as const
}

export function useCargoArrivalQuery(arrivalId: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryFn: () => getCargoReceivingClient().getArrival(arrivalId),
    queryKey: cargoArrivalDetailQueryKey(arrivalId),
    refetchInterval: (query) =>
      resolveCargoArrivalRefetchInterval({
        isTouchInFlight:
          queryClient.isMutating({ mutationKey: cargoArrivalTouchMutationKey(arrivalId) }) > 0,
        isVisible: document.visibilityState === 'visible',
        status: query.state.data?.status,
      }),
  })
}

/** Joga fora as páginas acumuladas e relê do início — o cursor delas nasceu noutra ordem. */
export function useReloadCargoArrivals(filters: CargoArrivalFilters): () => Promise<void> {
  const queryClient = useQueryClient()
  return () => queryClient.resetQueries({ queryKey: cargoArrivalsQueryKey(filters) })
}
