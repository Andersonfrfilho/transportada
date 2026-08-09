/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  buildTripManifestPath,
  MANIFEST_CREATE_BODY_KEYS,
  MDFE_MANIFEST_ERROR,
  MDFE_MANIFEST_PREVIEW_PATH,
  MDFE_MANIFESTS_PATH,
  TRIP_MANIFEST_CREATE_BODY_KEYS,
} from './mdfeManifest.constant'
import type {
  MdfeActionInput,
  MdfeCancelInput,
  MdfeCloseInput,
  MdfeIssuanceSummary,
  MdfeManifestCreateInput,
  MdfeManifestDetail,
  MdfeManifestListInput,
  MdfeManifestPage,
  MdfeManifestPreview,
} from './mdfeManifest.types'
import { isRecord, isString } from './mdfeManifestGuards.validation'
import { createMdfeManifestResponseAdapters } from './mdfeManifestResponse.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type MdfeManifestClient = Readonly<{
  cancelManifest: (input: MdfeCancelInput) => Promise<MdfeIssuanceSummary>
  closeManifest: (input: MdfeCloseInput) => Promise<MdfeIssuanceSummary>
  createManifest: (input: MdfeManifestCreateInput) => Promise<MdfeManifestDetail>
  discardManifest: (input: Readonly<{ manifestId: string }>) => Promise<MdfeManifestDetail>
  getManifest: (input: Readonly<{ manifestId: string }>) => Promise<MdfeManifestDetail>
  issueManifest: (input: MdfeActionInput) => Promise<MdfeIssuanceSummary>
  listManifests: (input: MdfeManifestListInput) => Promise<MdfeManifestPage>
  previewManifest: (
    input: Readonly<{ documentIds: readonly string[] }>,
  ) => Promise<MdfeManifestPreview>
}>

function requestError(code: string): Error {
  return new Error(code)
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return MDFE_MANIFEST_ERROR.REQUEST_FAILED
}

async function requestJson(
  input: Readonly<{ fetch: ClientDependencies['fetch']; request: Request }>,
): Promise<unknown> {
  let response: Response
  try {
    response = await input.fetch(input.request)
  } catch {
    throw requestError(MDFE_MANIFEST_ERROR.REQUEST_FAILED)
  }
  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(rawBody) as unknown
  } catch {
    throw requestError(
      response.ok ? MDFE_MANIFEST_ERROR.RESPONSE_INVALID : MDFE_MANIFEST_ERROR.REQUEST_FAILED,
    )
  }
  if (!response.ok) throw requestError(readErrorCode(payload))
  return payload
}

async function authorizedRequest(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    idempotencyKey?: string
    method: 'GET' | 'POST'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey
  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body

  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
  })
}

function readEnvelopeData(input: unknown): unknown {
  if (!isRecord(input) || !('data' in input)) {
    throw requestError(MDFE_MANIFEST_ERROR.RESPONSE_INVALID)
  }
  return input.data
}

function buildSearch(
  input: Readonly<{ cursor: null | string; limit: number }>,
  filters: Readonly<Record<string, string | undefined>>,
): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) search.set('cursor', input.cursor)
  search.set('limit', String(input.limit))
  for (const key of Object.keys(filters).sort()) {
    const value = filters[key]
    if (value !== undefined && value.length > 0) search.set(key, value)
  }
  return search.toString()
}

function pickKeys<TValue>(value: TValue, keys: readonly string[]): TValue {
  const source = value as Record<string, unknown>
  const picked: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in source) picked[key] = source[key]
  }
  return picked as TValue
}

export function createMdfeManifestClient(dependencies: ClientDependencies): MdfeManifestClient {
  const adapters = createMdfeManifestResponseAdapters()

  async function actionRequest(
    input: Readonly<{ body: unknown; idempotencyKey: string; manifestId: string; step: string }>,
  ): Promise<MdfeIssuanceSummary> {
    const response = await authorizedRequest({
      body: JSON.stringify(input.body),
      dependencies,
      idempotencyKey: input.idempotencyKey,
      method: 'POST',
      path: `${MDFE_MANIFESTS_PATH}/${input.manifestId}/${input.step}`,
    })
    return adapters.issuanceSummaryFromApi(readEnvelopeData(response))
  }

  return {
    cancelManifest(input) {
      return actionRequest({
        body: { justification: input.justification },
        idempotencyKey: input.idempotencyKey,
        manifestId: input.manifestId,
        step: 'cancel',
      })
    },
    closeManifest(input) {
      return actionRequest({
        body: { closureCityCode: input.closureCityCode, closureState: input.closureState },
        idempotencyKey: input.idempotencyKey,
        manifestId: input.manifestId,
        step: 'close',
      })
    },
    /** Viagem de origem troca a rota, não o corpo: `trip_id` nasce preenchido no manifesto. */
    async createManifest(input) {
      const fromTrip = input.tripId !== undefined && input.tripId !== ''
      const response = await authorizedRequest({
        body: JSON.stringify(
          pickKeys(input, fromTrip ? TRIP_MANIFEST_CREATE_BODY_KEYS : MANIFEST_CREATE_BODY_KEYS),
        ),
        dependencies,
        method: 'POST',
        path: fromTrip ? buildTripManifestPath(input.tripId ?? '') : MDFE_MANIFESTS_PATH,
      })
      return adapters.manifestDetailFromApi(readEnvelopeData(response))
    },
    /** ADR-0017: descarte não vai à SEFAZ — responde o manifesto pronto, sem chave de idempotência. */
    async discardManifest(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'POST',
        path: `${MDFE_MANIFESTS_PATH}/${input.manifestId}/discard`,
      })
      return adapters.manifestDetailFromApi(readEnvelopeData(response))
    },
    async getManifest(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${MDFE_MANIFESTS_PATH}/${input.manifestId}`,
      })
      return adapters.manifestDetailFromApi(readEnvelopeData(response))
    },
    issueManifest(input) {
      return actionRequest({
        body: {},
        idempotencyKey: input.idempotencyKey,
        manifestId: input.manifestId,
        step: 'issue',
      })
    },
    async listManifests(input) {
      const search = buildSearch(input, {
        statusEq: input.filters?.statusEq,
        vehicleIdEq: input.filters?.vehicleIdEq,
      })
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${MDFE_MANIFESTS_PATH}?${search}`,
      })
      return adapters.manifestListFromApi(response)
    },
    async previewManifest(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ documentIds: input.documentIds }),
        dependencies,
        method: 'POST',
        path: MDFE_MANIFEST_PREVIEW_PATH,
      })
      return adapters.previewFromApi(readEnvelopeData(response))
    },
  }
}
