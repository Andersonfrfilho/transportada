/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `GET /v1/toll-booths/extracts` e `POST /v1/toll-booths/reload` (spec 154 RF3/RF4) — cliente
 * próprio, no molde de `tollBoothCatalogClient.service.ts`: um cliente por recurso.
 */
import { FLEET_ERROR, TOLL_BOOTH_EXTRACTS_PATH, TOLL_BOOTH_RELOAD_PATH } from './fleet.constant'
import { isRecord, isString } from './fleetGuards.validation'
import {
  isTollBoothExtractRowList,
  isTollBoothReloadResult,
  type TollBoothExtractRow,
  type TollBoothReloadResult,
} from './tollBoothExtract.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type TollBoothCatalogReloadInput = Readonly<{ dataset: string; observedOn: string }>

export type TollBoothExtractClient = Readonly<{
  listTollBoothExtracts: () => Promise<readonly TollBoothExtractRow[]>
  reloadTollBoothCatalog: (input: TollBoothCatalogReloadInput) => Promise<TollBoothReloadResult>
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
  input: Readonly<{ dependencies: ClientDependencies; method: 'GET' | 'POST'; path: string }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${accessToken}` },
      method: input.method,
    }),
  })
}

function buildReloadQuery(input: TollBoothCatalogReloadInput): string {
  const search = new URLSearchParams()
  search.set('dataset', input.dataset)
  search.set('observedOn', input.observedOn)
  return search.toString()
}

export function createTollBoothExtractClient(
  dependencies: ClientDependencies,
): TollBoothExtractClient {
  return {
    async listTollBoothExtracts() {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: TOLL_BOOTH_EXTRACTS_PATH,
      })
      const data = isRecord(response) ? response.data : undefined
      if (!isTollBoothExtractRowList(data)) throw requestError(FLEET_ERROR.RESPONSE_INVALID)
      return data
    },
    async reloadTollBoothCatalog(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'POST',
        path: `${TOLL_BOOTH_RELOAD_PATH}?${buildReloadQuery(input)}`,
      })
      const data = isRecord(response) ? response.data : undefined
      if (!isTollBoothReloadResult(data)) throw requestError(FLEET_ERROR.RESPONSE_INVALID)
      return data
    },
  }
}
