/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import type { CargoArrivalStatus } from '../shared/cargoArrival.types'
import { resolveCargoArrivalRefetchInterval } from '../shared/cargoArrivalPolling.service'
import { CARGO_OCCURRENCE_QUERY_SEGMENT } from '../shared/cargoOccurrence.constant'
import { getCargoOccurrenceClient } from '../shared/cargoOccurrenceClient.service'
import { CARGO_RECEIVING_QUERY_KEY } from '../shared/cargoReceiving.constant'
import { cargoArrivalDetailQueryKey } from './useCargoArrivals.query'

/**
 * Debaixo da chave do detalhe de propósito: toda ação que relê a chegada relê a marcação junto, e a leitura
 * periódica do toque (que cancela o detalhe por prefixo) nunca deixa a marcação velha ao lado da nota nova.
 */
export function cargoOccurrencesQueryKey(arrivalId: string) {
  return [
    ...cargoArrivalDetailQueryKey(arrivalId),
    CARGO_OCCURRENCE_QUERY_SEGMENT.occurrences,
  ] as const
}

export const CARGO_OCCURRENCE_TYPES_KEY = [
  CARGO_RECEIVING_QUERY_KEY,
  CARGO_OCCURRENCE_QUERY_SEGMENT.types,
] as const

export function cargoDocumentProductsQueryKey(
  input: Readonly<{ arrivalId: string; documentId: string }>,
) {
  return [
    CARGO_RECEIVING_QUERY_KEY,
    CARGO_OCCURRENCE_QUERY_SEGMENT.products,
    input.arrivalId,
    input.documentId,
  ] as const
}

/** Marcação por nota, avarias e contagens: mais de uma pessoa trabalha a chegada, e a leitura traz o colega. */
export function useCargoOccurrencesQuery(
  input: Readonly<{ arrivalId: string; status: CargoArrivalStatus | undefined }>,
) {
  return useQuery({
    queryFn: () => getCargoOccurrenceClient().listOccurrences(input.arrivalId),
    queryKey: cargoOccurrencesQueryKey(input.arrivalId),
    refetchInterval: () =>
      resolveCargoArrivalRefetchInterval({
        isTouchInFlight: false,
        isVisible: document.visibilityState === 'visible',
        status: input.status,
      }),
  })
}

/** Só lê com o formulário aberto: quem não abre avaria não paga a consulta. */
export function useReceivingTypesQuery(input: Readonly<{ isEnabled: boolean }>) {
  return useQuery({
    enabled: input.isEnabled,
    queryFn: () => getCargoOccurrenceClient().listTypes(),
    queryKey: CARGO_OCCURRENCE_TYPES_KEY,
  })
}

export function useDocumentProductsQuery(
  input: Readonly<{ arrivalId: string; documentId: string }>,
) {
  return useQuery({
    queryFn: () => getCargoOccurrenceClient().listDocumentProducts(input),
    queryKey: cargoDocumentProductsQueryKey(input),
  })
}
