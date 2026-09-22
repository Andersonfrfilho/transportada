/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A troca dos clientes, feita **uma vez** para o processo inteiro. ⚠️ `mock.module` não se desfaz, e
 * duas suítes trocando o mesmo módulo cada uma com o seu objeto disputariam qual fica: por isso os
 * falsos moram aqui, e cada teste só reconfigura `tripHookFakes`.
 */
import { mock } from 'bun:test'

import type { TripCandidateDocument } from '@/modules/trip/shared/trip.types'

import {
  createUnexpectedTripClient,
  type FakeTripClient,
} from '../fixtures/tripAssemblyHooks.fixture'

export const tripHookFakes: {
  loadDocuments: () => Promise<readonly TripCandidateDocument[]>
  rejectedSuggestionIds: string[]
  tripClient: FakeTripClient
} = {
  loadDocuments: () => Promise.reject(new Error('UNEXPECTED_DOCUMENTS_LOAD')),
  rejectedSuggestionIds: [],
  tripClient: createUnexpectedTripClient(),
}

export function resetTripHookFakes(documents: readonly TripCandidateDocument[]): void {
  tripHookFakes.loadDocuments = () => Promise.resolve(documents)
  tripHookFakes.rejectedSuggestionIds = []
  tripHookFakes.tripClient = createUnexpectedTripClient()
}

/** Antes de qualquer hook ser importado: ele tem de nascer já apontando para os falsos. */
const workspaceHook = await import('@/modules/trip/hooks/useTripWorkspace.hook')
void mock.module('@/modules/trip/hooks/useTripWorkspace.hook', () => ({
  ...workspaceHook,
  getTripClient: () => tripHookFakes.tripClient,
}))
const suggestionHook = await import('@/modules/routing/hooks/useRouteSuggestion.hook')
void mock.module('@/modules/routing/hooks/useRouteSuggestion.hook', () => ({
  ...suggestionHook,
  getRouteSuggestionClient: () => ({
    rejectMultiVehicle: ({ suggestionId }: Readonly<{ suggestionId: string }>) => {
      tripHookFakes.rejectedSuggestionIds.push(suggestionId)
      return Promise.resolve(undefined)
    },
  }),
}))
void mock.module('@/modules/trip/shared/availableTripDocuments.service', () => ({
  loadAvailableTripDocuments: () => tripHookFakes.loadDocuments(),
}))
