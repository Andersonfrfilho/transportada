/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createPendingItemsClient,
  type PendingItem,
  type PendingItemsClient as Client,
} from '../shared/pendingItemsClient.service'

const PENDING_ITEMS_QUERY_KEY = 'pending-items'
const PENDING_ITEMS_PAGE_SIZE = 25
const FLEET_READ_PERMISSION = 'fleet.read'

export type PendingItemsClient = Client

export type PendingItemsController = Readonly<{
  canReadPendingItems: boolean
}>

export function createPendingItemsController(
  input: Readonly<{ permissions: readonly string[] }>,
): PendingItemsController {
  return { canReadPendingItems: input.permissions.includes(FLEET_READ_PERMISSION) }
}

function getPendingItemsClient(): PendingItemsClient {
  return createPendingItemsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function usePendingItems(
  input: Readonly<{
    client?: PendingItemsClient
    companyId?: string
    permissions: readonly string[]
  }>,
) {
  const client = input.client ?? getPendingItemsClient()
  const [cursor, setCursor] = useState<string | null>(null)
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createPendingItemsController({ permissions })

  const pageQuery = useQuery({
    enabled: controller.canReadPendingItems,
    queryFn: () => client.listPendingItems({ cursor, limit: PENDING_ITEMS_PAGE_SIZE }),
    queryKey: [PENDING_ITEMS_QUERY_KEY, input.companyId, cursor],
  })

  const items: readonly PendingItem[] = pageQuery.data?.items ?? []
  const nextCursor = pageQuery.data?.nextCursor ?? null

  return {
    controller,
    cursor,
    goToFirstPage: () => setCursor(null),
    goToNextPage: () => setCursor(nextCursor),
    items,
    nextCursor,
    pageQuery,
  }
}
