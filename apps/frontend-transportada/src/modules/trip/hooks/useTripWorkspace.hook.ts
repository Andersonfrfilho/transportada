/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  TRIP_MANAGE_PERMISSION,
  TRIP_QUERY_KEY,
  TRIP_READ_PERMISSION,
} from '../shared/trip.constant'
import type {
  CreateTripBody,
  FindNfeDocumentByAccessKeyInput,
  LinkTripDocumentInput,
  ScannedNfeDocument,
  TripDetail,
  TripDocument,
  TripDocumentActionInput,
} from '../shared/trip.types'
import { createTripClient, type TripClient } from '../shared/tripClient.service'

export type TripController = Readonly<{
  canManageTrips: boolean
  canReadTrips: boolean
  closeTrip: (input: Readonly<{ tripId: string }>) => Promise<TripDetail>
  createTrip: (input: CreateTripBody) => Promise<TripDetail>
  deliverTripDocument: (input: TripDocumentActionInput) => Promise<TripDocument>
  findNfeDocumentByAccessKey: (
    input: FindNfeDocumentByAccessKeyInput,
  ) => Promise<null | ScannedNfeDocument>
  getTrip: (input: Readonly<{ tripId: string }>) => Promise<TripDetail>
  linkTripDocument: (input: LinkTripDocumentInput) => Promise<TripDocument>
  releaseTripDocument: (input: TripDocumentActionInput) => Promise<TripDocument>
}>

function forbidden(): Promise<never> {
  return Promise.reject(new Error('TRIP_FORBIDDEN'))
}

export function createTripController(
  input: Readonly<{ client: TripClient; permissions: readonly string[] }>,
): TripController {
  const canReadTrips = input.permissions.includes(TRIP_READ_PERMISSION)
  const canManageTrips = input.permissions.includes(TRIP_MANAGE_PERMISSION)

  return {
    canManageTrips,
    canReadTrips,
    closeTrip: (body) => (canManageTrips ? input.client.closeTrip(body) : forbidden()),
    createTrip: (body) => (canManageTrips ? input.client.createTrip(body) : forbidden()),
    deliverTripDocument: (body) =>
      canManageTrips ? input.client.deliverTripDocument(body) : forbidden(),
    findNfeDocumentByAccessKey: (query) =>
      canManageTrips ? input.client.findNfeDocumentByAccessKey(query) : forbidden(),
    getTrip: (query) => (canReadTrips ? input.client.getTrip(query) : forbidden()),
    linkTripDocument: (body) =>
      canManageTrips ? input.client.linkTripDocument(body) : forbidden(),
    releaseTripDocument: (body) =>
      canManageTrips ? input.client.releaseTripDocument(body) : forbidden(),
  }
}

export function getTripClient(): TripClient {
  return createTripClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * Query desabilitada fica `isPending` para sempre no TanStack v5: sem tratar a permissão antes,
 * quem não tem `fleet.read` veria "carregando" eternamente em vez do aviso de acesso negado.
 */
export function resolveQueryStatus(
  input: Readonly<{ canRead: boolean; isError: boolean; isPending: boolean }>,
): 'error' | 'forbidden' | 'loading' | 'success' {
  if (!input.canRead) return 'forbidden'
  if (input.isError) return 'error'
  if (input.isPending) return 'loading'
  return 'success'
}

export type TripWorkspaceController = ReturnType<typeof useTripWorkspace>

export function useTripWorkspace(
  input: Readonly<{ companyId?: string; permissions: readonly string[]; tripId?: string }>,
) {
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createTripController({ client: getTripClient(), permissions })
  const queryClient = useQueryClient()
  const tripKey = [TRIP_QUERY_KEY, input.companyId, input.tripId] as const
  /** Prefixo compartilhado: invalidar `['trips']` alcança o detalhe e a tabela paginada. */
  const listKey = [TRIP_QUERY_KEY] as const

  const tripQuery = useQuery({
    enabled: controller.canReadTrips && input.tripId !== undefined && input.tripId !== '',
    queryFn: () => controller.getTrip({ tripId: input.tripId ?? '' }),
    queryKey: tripKey,
  })

  function invalidate(): Promise<void> {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: tripKey }),
      queryClient.invalidateQueries({ queryKey: listKey }),
    ]).then(() => undefined)
  }

  const createMutation = useMutation({ mutationFn: controller.createTrip, onSuccess: invalidate })
  const closeMutation = useMutation({ mutationFn: controller.closeTrip, onSuccess: invalidate })
  const linkDocumentMutation = useMutation({
    mutationFn: controller.linkTripDocument,
    onSuccess: invalidate,
  })
  const deliverDocumentMutation = useMutation({
    mutationFn: controller.deliverTripDocument,
    onSuccess: invalidate,
  })
  const releaseDocumentMutation = useMutation({
    mutationFn: controller.releaseTripDocument,
    onSuccess: invalidate,
  })

  return {
    closeMutation,
    controller,
    createMutation,
    deliverDocumentMutation,
    linkDocumentMutation,
    releaseDocumentMutation,
    status: resolveQueryStatus({
      canRead: controller.canReadTrips,
      isError: tripQuery.isError,
      isPending: tripQuery.isPending,
    }),
    trip: tripQuery.data,
    tripQuery,
  }
}
