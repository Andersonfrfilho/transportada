/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useInfiniteQuery } from '@tanstack/react-query'

import type { AvailableCargoDocument, CargoPage } from '../shared/cargoArrival.types'
import { CARGO_RECEIVING_QUERY_KEY } from '../shared/cargoReceiving.constant'
import { getCargoReceivingClient } from '../shared/cargoReceivingClient.service'

export function useAvailableDocumentsQuery(contractorId: string) {
  return useInfiniteQuery({
    enabled: contractorId !== '',
    getNextPageParam: (page: CargoPage<AvailableCargoDocument>) => page.nextCursor,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getCargoReceivingClient().listAvailableDocuments({ contractorId, cursor: pageParam }),
    queryKey: [CARGO_RECEIVING_QUERY_KEY, 'available-documents', contractorId],
  })
}
