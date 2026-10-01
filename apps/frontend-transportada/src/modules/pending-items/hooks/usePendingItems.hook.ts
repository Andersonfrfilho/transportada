/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useInfiniteQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createPendingItemsClient,
  flattenPendingItemPages,
  lastPendingItemsCursor,
  type PendingItemPage,
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
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createPendingItemsController({ permissions })

  /**
   * T18 (revisão, MENOR 10): "carregar mais" tem de **acumular**, não trocar de página — era um
   * `useQuery` reexecutado com o cursor novo, e cada clique substituía a lista inteira pela página
   * seguinte em vez de somar a ela. `useInfiniteQuery` é o mesmo padrão de
   * `useTripOccurrenceFeedQuery` (`trip/queries/tripOccurrenceFeed.query.ts`).
   */
  const pageQuery = useInfiniteQuery({
    enabled: controller.canReadPendingItems,
    getNextPageParam: (lastPage: PendingItemPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      client.listPendingItems({ cursor: pageParam, limit: PENDING_ITEMS_PAGE_SIZE }),
    queryKey: [PENDING_ITEMS_QUERY_KEY, input.companyId],
  })

  const items = flattenPendingItemPages(pageQuery.data?.pages ?? [])
  const nextCursor = lastPendingItemsCursor(pageQuery.data?.pages ?? [])

  return {
    controller,
    goToNextPage: () => void pageQuery.fetchNextPage(),
    items,
    nextCursor,
    pageQuery,
  }
}
