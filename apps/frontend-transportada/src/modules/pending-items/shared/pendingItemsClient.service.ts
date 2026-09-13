/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPendingItemPageAdapter } from './pendingItemsResponse.validation'

export type PendingItemKind = 'vehicleBodyTypeMissing'

export type PendingItem = Readonly<{
  entityId: string
  entityType: 'vehicle'
  kind: PendingItemKind
  label: string
}>

export type PendingItemPage = Readonly<{
  items: readonly PendingItem[]
  nextCursor: null | string
}>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type PendingItemsClient = Readonly<{
  listPendingItems: (
    input: Readonly<{ cursor?: null | string; limit?: number }>,
  ) => Promise<PendingItemPage>
}>

function requestError(code: string): Error {
  return new Error(code)
}

function createSearch(input: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  return search.toString()
}

async function authorizedGet(
  input: Readonly<{ dependencies: ClientDependencies; path: string }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'GET',
      }),
    )
  } catch {
    throw requestError('PENDING_ITEMS_REQUEST_FAILED')
  }
  if (!response.ok) throw requestError('PENDING_ITEMS_REQUEST_FAILED')
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw requestError('PENDING_ITEMS_RESPONSE_INVALID')
  }
}

export function createPendingItemsClient(dependencies: ClientDependencies): PendingItemsClient {
  const adapters = createPendingItemPageAdapter()
  return {
    async listPendingItems(input) {
      return adapters.pageFromApi(
        await authorizedGet({
          dependencies,
          path: `/pending-items?${createSearch({ cursor: input.cursor, limit: input.limit })}`,
        }),
      )
    },
  }
}
