/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { CARGO_CASE_QUERY_SEGMENT } from '../shared/cargoOccurrenceCase.constant'
import { getCargoOccurrenceCaseClient } from '../shared/cargoOccurrenceCaseClient.service'
import { CARGO_RECEIVING_QUERY_KEY } from '../shared/cargoReceiving.constant'

export function cargoSettlementQueryKey(occurrenceId: string) {
  return [CARGO_RECEIVING_QUERY_KEY, CARGO_CASE_QUERY_SEGMENT.settlement, occurrenceId] as const
}

/** O acerto já gravado, para o formulário abrir com ele em vez de vazio. Só lê com o formulário à vista. */
export function useCargoSettlementQuery(
  input: Readonly<{ isEnabled: boolean; occurrenceId: string }>,
) {
  return useQuery({
    enabled: input.isEnabled,
    queryFn: () => getCargoOccurrenceCaseClient().readSettlement(input.occurrenceId),
    queryKey: cargoSettlementQueryKey(input.occurrenceId),
  })
}
