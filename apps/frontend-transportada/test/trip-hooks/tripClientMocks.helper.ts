/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A troca dos clientes, feita **uma vez** para o processo inteiro. ⚠️ `mock.module` não se desfaz, e
 * duas suítes trocando o mesmo módulo cada uma com o seu objeto disputariam qual fica: por isso os
 * falsos moram aqui, e cada teste só reconfigura `tripHookFakes`.
 */
import { mock } from 'bun:test'

import type { RouteSuggestionClient } from '@/modules/routing/shared/routeSuggestionClient.service'
import type { FleetDriverVehicleLink, FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import type { TripCandidateDocument } from '@/modules/trip/shared/trip.types'

import {
  createUnexpectedTripClient,
  type FakeTripClient,
} from '../fixtures/tripAssemblyHooks.fixture'

type MultiVehicleRequest = Parameters<RouteSuggestionClient['createMultiVehicle']>[0]

export const tripHookFakes: {
  driverVehicleLinksByDriverId: Record<string, readonly FleetDriverVehicleLink[]>
  /** Os veículos de tração ativos que a frota oferece à sugestão multi-veículo (spec 237 T5.2). */
  fleetVehicles: readonly FleetVehicleDetail[]
  loadDocuments: () => Promise<readonly TripCandidateDocument[]>
  /** Cada `POST /route-suggestions/multi-vehicle` que a tela fez: é o que o roteirizador recebeu. */
  multiVehicleRequests: MultiVehicleRequest[]
  rejectedSuggestionIds: string[]
  tripClient: FakeTripClient
} = {
  driverVehicleLinksByDriverId: {},
  fleetVehicles: [],
  loadDocuments: () => Promise.reject(new Error('UNEXPECTED_DOCUMENTS_LOAD')),
  multiVehicleRequests: [],
  rejectedSuggestionIds: [],
  tripClient: createUnexpectedTripClient(),
}

export function resetTripHookFakes(documents: readonly TripCandidateDocument[]): void {
  tripHookFakes.driverVehicleLinksByDriverId = {}
  tripHookFakes.fleetVehicles = []
  tripHookFakes.loadDocuments = () => Promise.resolve(documents)
  tripHookFakes.multiVehicleRequests = []
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
    createMultiVehicle: (request: MultiVehicleRequest) => {
      tripHookFakes.multiVehicleRequests.push(request)
      return new Promise<never>(() => undefined)
    },
    rejectMultiVehicle: ({ suggestionId }: Readonly<{ suggestionId: string }>) => {
      tripHookFakes.rejectedSuggestionIds.push(suggestionId)
      return Promise.resolve(undefined)
    },
  }),
}))
void mock.module('@/modules/trip/shared/availableTripDocuments.service', () => ({
  loadAvailableTripDocuments: () => tripHookFakes.loadDocuments(),
}))
const fleetHook = await import('@/modules/fleet/hooks/useFleet.hook')
void mock.module('@/modules/fleet/hooks/useFleet.hook', () => ({
  ...fleetHook,
  getFleetClient: () => ({
    listDriverVehiclePairs: () => Promise.resolve([]),
    listDrivers: () => Promise.resolve({ items: [], nextCursor: null }),
    listVehicles: () => Promise.resolve({ items: tripHookFakes.fleetVehicles, nextCursor: null }),
    listDriverVehicles: ({ driverId }: Readonly<{ driverId: string }>) =>
      Promise.resolve(tripHookFakes.driverVehicleLinksByDriverId[driverId] ?? []),
  }),
}))
