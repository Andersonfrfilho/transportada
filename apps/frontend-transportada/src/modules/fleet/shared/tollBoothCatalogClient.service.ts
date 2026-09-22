/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `GET /v1/toll-booths` (spec 154 RF1) — cliente próprio, no molde de `fleetCatalogClient.service.ts`:
 * o módulo já separa um cliente por recurso em vez de inchar `fleetClient.service.ts`.
 */
import { FLEET_ERROR, TOLL_BOOTH_CATALOG_PATH } from './fleet.constant'
import { isRecord, isString } from './fleetGuards.validation'
import { isTollBoothCatalogPage, type TollBoothCatalogPage } from './tollBoothCatalog.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type TollBoothCatalogQuery = Readonly<{
  page: number
  perPage: number
  search?: string
}>

export type TollBoothCatalogClient = Readonly<{
  listTollBoothCatalog: (input: TollBoothCatalogQuery) => Promise<TollBoothCatalogPage>
}>

function requestError(code: string): Error {
  return new Error(code)
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return FLEET_ERROR.REQUEST_FAILED
}

async function requestJson(
  input: Readonly<{ fetch: ClientDependencies['fetch']; request: Request }>,
): Promise<unknown> {
  let response: Response
  try {
    response = await input.fetch(input.request)
  } catch {
    throw requestError(FLEET_ERROR.REQUEST_FAILED)
  }
  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(rawBody) as unknown
  } catch {
    throw requestError(response.ok ? FLEET_ERROR.RESPONSE_INVALID : FLEET_ERROR.REQUEST_FAILED)
  }
  if (!response.ok) throw requestError(readErrorCode(payload))
  return payload
}

async function authorizedRequest(
  input: Readonly<{ dependencies: ClientDependencies; path: string }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${accessToken}` },
      method: 'GET',
    }),
  })
}

function buildCatalogQuery(input: TollBoothCatalogQuery): string {
  const search = new URLSearchParams()
  search.set('page', String(input.page))
  search.set('perPage', String(input.perPage))
  if (input.search !== undefined && input.search.length > 0) search.set('search', input.search)
  return search.toString()
}

export function createTollBoothCatalogClient(
  dependencies: ClientDependencies,
): TollBoothCatalogClient {
  return {
    async listTollBoothCatalog(input) {
      const response = await authorizedRequest({
        dependencies,
        path: `${TOLL_BOOTH_CATALOG_PATH}?${buildCatalogQuery(input)}`,
      })
      if (!isTollBoothCatalogPage(response)) throw requestError(FLEET_ERROR.RESPONSE_INVALID)
      return response
    },
  }
}
