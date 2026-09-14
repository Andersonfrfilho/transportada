/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 101: a conta da distribuição proposta.
 *
 * ⚠️ `enabled` exige **duas** coisas: a permissão `trip.financials` e a sugestão já `ready`.
 * Perguntar antes de o solver terminar devolveria `409` a cada poll do diálogo, e sem a permissão
 * a seção nem existe — dinheiro tem permissão própria.
 */
import { useQuery } from '@tanstack/react-query'

import type { RouteSuggestionClient } from '../shared/routeSuggestionClient.service'
import type { SuggestionValuation } from '../shared/suggestionValuation.service'

export const TRIP_FINANCIALS_PERMISSION = 'trip.financials'

export function canReadSuggestionValuation(permissions: readonly string[]): boolean {
  return permissions.includes(TRIP_FINANCIALS_PERMISSION)
}

export function suggestionValuationQueryKey(suggestionId: null | string) {
  return ['routing', 'suggestion-valuation', suggestionId] as const
}

export function useSuggestionValuation(input: {
  readonly client: RouteSuggestionClient
  readonly isReady: boolean
  readonly permissions: readonly string[]
  readonly suggestionId: null | string
}) {
  const canRead = canReadSuggestionValuation(input.permissions)
  const enabled = canRead && input.isReady && input.suggestionId !== null

  const query = useQuery<null | SuggestionValuation>({
    enabled,
    queryFn: () =>
      input.client.readMultiVehicleValuation({ suggestionId: input.suggestionId ?? '' }),
    queryKey: suggestionValuationQueryKey(input.suggestionId),
  })

  return {
    canRead,
    isLoading: enabled && query.isLoading,
    valuation: query.data ?? null,
  }
}
