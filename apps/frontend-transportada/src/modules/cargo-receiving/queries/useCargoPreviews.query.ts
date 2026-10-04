/* Copyright (c) 2026 Ada Technology. MIT License. */
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'

import type {
  CargoPreviewDetail,
  CargoPreviewListFilters,
  CargoPreviewPage,
  CargoPreviewItemFilters,
  CargoPreviewSummary,
} from '../shared/cargoPreview.types'
import { resolveCargoPreviewRefetchInterval } from '../shared/cargoPreviewPolling.service'
import { getCargoPreviewClient } from '../shared/cargoPreviewClient.service'
import { CARGO_RECEIVING_QUERY_KEY } from '../shared/cargoReceiving.constant'

export const CARGO_PREVIEWS_LIST_KEY = [CARGO_RECEIVING_QUERY_KEY, 'previews'] as const

export function cargoPreviewDetailQueryKey(previewId: string) {
  return [CARGO_RECEIVING_QUERY_KEY, 'preview', previewId] as const
}

/** Acumula as páginas por cursor e repete a leitura SÓ enquanto alguma prévia está na fila ou sendo lida. */
export function useCargoPreviewsQuery(filters: CargoPreviewListFilters) {
  return useInfiniteQuery({
    getNextPageParam: (page: CargoPreviewPage<CargoPreviewSummary>) => page.nextCursor,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getCargoPreviewClient().listPreviews({ cursor: pageParam, filters }),
    queryKey: [...CARGO_PREVIEWS_LIST_KEY, filters],
    refetchInterval: (query) =>
      resolveCargoPreviewRefetchInterval(
        query.state.data?.pages.flatMap((page) => page.items.map((preview) => preview.status)) ??
          [],
      ),
  })
}

type DetailFilters = Readonly<Pick<CargoPreviewItemFilters, 'routeName' | 'state'>>

/** Cada página é o detalhe inteiro com a próxima fatia de linhas: o cabeçalho vem da primeira. */
export function useCargoPreviewQuery(
  input: Readonly<{ filters: DetailFilters; previewId: string }>,
) {
  return useInfiniteQuery({
    getNextPageParam: (page: CargoPreviewDetail) => page.items.nextCursor,
    initialPageParam: null as string | null,
    /** Trocar o filtro não derruba o cabeçalho nem os filtros: eles moram na mesma tela que a consulta. */
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) =>
      getCargoPreviewClient().getPreview({
        filters: { ...input.filters, afterRow: pageParam },
        previewId: input.previewId,
      }),
    queryKey: [...cargoPreviewDetailQueryKey(input.previewId), input.filters],
    refetchInterval: (query) => {
      const status = query.state.data?.pages[0]?.status
      return resolveCargoPreviewRefetchInterval(status === undefined ? [] : [status])
    },
  })
}
