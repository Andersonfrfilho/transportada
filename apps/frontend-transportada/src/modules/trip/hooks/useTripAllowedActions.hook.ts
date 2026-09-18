/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import {
  resolveFieldActionCapabilities,
  type FieldActionCapabilities,
} from '../shared/tripFieldActions.service'
import type { TripClient } from '../shared/tripClient.service'

export type TripAllowedActionsInput = Readonly<{
  canRead: boolean
  client: TripClient
  documentIds: readonly string[]
  stopIds: readonly string[]
  tripId: string | undefined
}>

export type TripAllowedActionsController = FieldActionCapabilities &
  Readonly<{ isPending: boolean }>

/**
 * Spec 156 T8 (t7-design §2.6): a lista mora em rota própria — `GET /trips/:id/allowed-actions`
 * (T7.2, ressalva M1) —, nunca numa chave do detalhe. Ausente ou malformada (API antiga na janela
 * de deploy, consulta ainda sem resposta, resposta que `parseTripAllowedActions` recusou), nenhuma
 * ação de campo aparece: `resolveFieldActionCapabilities` falha **fechada**.
 */
export function useTripAllowedActions(
  input: TripAllowedActionsInput,
): TripAllowedActionsController {
  const query = useQuery({
    enabled: input.canRead && input.tripId !== undefined && input.tripId !== '',
    queryFn: () =>
      input.client.readTripAllowedActions({
        documentIds: input.documentIds,
        stopIds: input.stopIds,
        tripId: input.tripId ?? '',
      }),
    queryKey: ['trips', input.tripId, 'allowed-actions'] as const,
  })

  return { ...resolveFieldActionCapabilities(query.data), isPending: query.isPending }
}
