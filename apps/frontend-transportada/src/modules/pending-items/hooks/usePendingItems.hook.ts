/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createPendingItemsClient,
  type AddressSuggestionDecision,
  flattenPendingItemPages,
  lastPendingItemsCursor,
  type PendingItemPage,
  type PendingItemsClient as Client,
  removePendingItemFromPages,
} from '../shared/pendingItemsClient.service'

const PENDING_ITEMS_QUERY_KEY = 'pending-items'
const PENDING_ITEMS_PAGE_SIZE = 25
const FLEET_READ_PERMISSION = 'fleet.read'
const TRIP_MANAGE_PERMISSION = 'trip.manage'

export type PendingItemsClient = Client

export type PendingItemsController = Readonly<{
  canDecideAddressSuggestions: boolean
  canReadPendingItems: boolean
}>

export function createPendingItemsController(
  input: Readonly<{ permissions: readonly string[] }>,
): PendingItemsController {
  return {
    canDecideAddressSuggestions: input.permissions.includes(TRIP_MANAGE_PERMISSION),
    canReadPendingItems: input.permissions.includes(FLEET_READ_PERMISSION),
  }
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

  const queryClient = useQueryClient()
  const queryKey = [PENDING_ITEMS_QUERY_KEY, input.companyId]
  type Pages = InfiniteData<PendingItemPage, string | null>
  const decisionMutation = useMutation({
    mutationFn: (decision: { decision: AddressSuggestionDecision; suggestionId: string }) =>
      client.decideAddressSuggestion(decision),
    onError: (_error, _decision, previous) => {
      if (previous !== undefined) queryClient.setQueryData(queryKey, previous)
    },
    onMutate: async (decision) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Pages>(queryKey)
      if (previous !== undefined) {
        queryClient.setQueryData<Pages>(queryKey, {
          ...previous,
          pages: [
            ...removePendingItemFromPages({
              entityId: decision.suggestionId,
              pages: previous.pages,
            }),
          ],
        })
      }
      return previous
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const items = flattenPendingItemPages(pageQuery.data?.pages ?? [])
  const nextCursor = lastPendingItemsCursor(pageQuery.data?.pages ?? [])

  return {
    controller,
    decisionMutation,
    goToNextPage: () => void pageQuery.fetchNextPage(),
    items,
    nextCursor,
    pageQuery,
  }
}
