/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NFE_DOCUMENTS_PATH, SCAN_LOOKUP_LIMIT, TRIP_ERROR, TRIPS_PATH } from './trip.constant'
import type {
  BatchStatusInput,
  BatchStatusResult,
  CancelTripResult,
  CreateTripBody,
  DeliveryAddressHistoryInput,
  DeliveryAddressOverride,
  DispatchTripInput,
  DispatchTripResult,
  FindNfeDocumentByAccessKeyInput,
  LinkTripDocumentInput,
  OverrideDeliveryAddressInput,
  PlanTripRouteResult,
  ReorderTripStopsInput,
  ReorderTripStopsResult,
  ScannedNfeDocument,
  TransitionTripDocumentInput,
  TransitionTripDocumentResult,
  TripCteBatchResult,
  TripDetail,
  SetTripMdfeRequirementInput,
  TripFiscalReadiness,
  TripMdfeRequirement,
  TripDocument,
  TripDocumentActionInput,
  TripListInput,
  TripPage,
} from './trip.types'
import { isRecord, isString } from './tripGuards.validation'
import { createTripResponseAdapters } from './tripResponse.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type TripClient = Readonly<{
  batchStatus: (input: BatchStatusInput) => Promise<BatchStatusResult>
  cancelTrip: (input: Readonly<{ tripId: string }>) => Promise<CancelTripResult>
  closeTrip: (input: Readonly<{ tripId: string }>) => Promise<TripDetail>
  createTrip: (input: CreateTripBody) => Promise<TripDetail>
  /** Entregar passou pela máquina de estados na API, então devolve o estado da viagem junto. */
  deliverTripDocument: (input: TripDocumentActionInput) => Promise<TransitionTripDocumentResult>
  dispatchTrip: (input: DispatchTripInput) => Promise<DispatchTripResult>
  findNfeDocumentByAccessKey: (
    input: FindNfeDocumentByAccessKeyInput,
  ) => Promise<null | ScannedNfeDocument>
  createTripCteBatch: (input: Readonly<{ tripId: string }>) => Promise<TripCteBatchResult>
  getTrip: (input: Readonly<{ tripId: string }>) => Promise<TripDetail>
  readFiscalReadiness: (input: Readonly<{ tripId: string }>) => Promise<TripFiscalReadiness>
  setTripMdfeRequirement: (input: SetTripMdfeRequirementInput) => Promise<TripMdfeRequirement>
  linkTripDocument: (input: LinkTripDocumentInput) => Promise<TripDocument>
  listDeliveryAddressHistory: (
    input: DeliveryAddressHistoryInput,
  ) => Promise<readonly DeliveryAddressOverride[]>
  listTrips: (input: TripListInput) => Promise<TripPage>
  overrideDeliveryAddress: (input: OverrideDeliveryAddressInput) => Promise<DeliveryAddressOverride>
  planTripRoute: (input: Readonly<{ tripId: string }>) => Promise<PlanTripRouteResult>
  releaseTripDocument: (input: TripDocumentActionInput) => Promise<TripDocument>
  reorderTripStops: (input: ReorderTripStopsInput) => Promise<ReorderTripStopsResult>
  transitionTripDocument: (
    input: TransitionTripDocumentInput,
  ) => Promise<TransitionTripDocumentResult>
}>

function requestError(code: string): Error {
  return new Error(code)
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return TRIP_ERROR.REQUEST_FAILED
}

async function requestJson(
  input: Readonly<{ fetch: ClientDependencies['fetch']; request: Request }>,
): Promise<unknown> {
  let response: Response
  try {
    response = await input.fetch(input.request)
  } catch (cause) {
    // Cancelamento não é falha de rede: o separador bipa rápido, e a leitura nova aborta a anterior.
    if (input.request.signal.aborted) throw cause
    throw requestError(TRIP_ERROR.REQUEST_FAILED)
  }
  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw requestError(response.ok ? TRIP_ERROR.RESPONSE_INVALID : TRIP_ERROR.REQUEST_FAILED)
  }
  if (!response.ok) throw requestError(readErrorCode(payload))
  return payload
}

async function authorizedRequest(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    idempotencyKey?: string
    method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'
    path: string
    signal?: AbortSignal
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey
  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body
  if (input.signal !== undefined) requestInit.signal = input.signal

  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
  })
}

function readEnvelopeData(input: unknown): unknown {
  if (!isRecord(input) || !('data' in input)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
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

export function createTripClient(dependencies: ClientDependencies): TripClient {
  const adapters = createTripResponseAdapters()

  function documentPath(input: TripDocumentActionInput): string {
    return `${TRIPS_PATH}/${input.tripId}/documents/${input.documentId}`
  }

  return {
    async batchStatus(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          action: input.action,
          documentIds: input.documentIds,
          note: input.note ?? null,
          returnReason: input.returnReason ?? null,
        }),
        dependencies,
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/documents/batch-status`,
      })
      return adapters.batchStatusResultFromApi(readEnvelopeData(response))
    },
    async cancelTrip(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/cancel`,
      })
      return adapters.cancelTripResultFromApi(readEnvelopeData(response))
    },
    async closeTrip(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/close`,
      })
      return adapters.tripDetailFromApi(readEnvelopeData(response))
    },
    async createTrip(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ driverIds: input.driverIds, vehicleId: input.vehicleId }),
        dependencies,
        method: 'POST',
        path: TRIPS_PATH,
      })
      return adapters.tripDetailFromApi(readEnvelopeData(response))
    },
    async deliverTripDocument(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'POST',
        path: `${documentPath(input)}/deliver`,
      })
      return adapters.transitionTripDocumentResultFromApi(readEnvelopeData(response))
    },
    async dispatchTrip(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          force: input.force ?? false,
          forceReason: input.forceReason ?? null,
        }),
        dependencies,
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/dispatch`,
      })
      return adapters.dispatchTripResultFromApi(readEnvelopeData(response))
    },
    async findNfeDocumentByAccessKey(input) {
      const search = buildSearch(
        { cursor: null, limit: SCAN_LOOKUP_LIMIT },
        {
          accessKey: input.accessKey,
        },
      )
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${NFE_DOCUMENTS_PATH}?${search}`,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })
      return adapters.scannedNfeDocumentFromApi(response)
    },
    async getTrip(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${TRIPS_PATH}/${input.tripId}`,
      })
      return adapters.tripDetailFromApi(readEnvelopeData(response))
    },
    /**
     * Spec 065 D4bis: a chave de idempotência é do **clique**. Sem ela, dois toques com a rede lenta
     * criariam dois lotes para a mesma viagem — e lote de CT-e duplicado é emissão duplicada.
     */
    async createTripCteBatch(input) {
      const response = await authorizedRequest({
        dependencies,
        idempotencyKey: crypto.randomUUID(),
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/cte-batches`,
      })
      return adapters.tripCteBatchResultFromApi(readEnvelopeData(response))
    },
    /**
     * Spec 065 D4c: `null` é um dos três estados, e por isso o corpo o carrega por extenso — omitir
     * o campo faria o servidor recusar, que é o que se quer: ninguém adivinha exigência fiscal.
     */
    async setTripMdfeRequirement(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ reason: input.reason, requiresMdfe: input.requiresMdfe }),
        dependencies,
        method: 'PUT',
        path: `${TRIPS_PATH}/${input.tripId}/mdfe-requirement`,
      })
      return adapters.tripMdfeRequirementFromApi(readEnvelopeData(response))
    },
    async readFiscalReadiness(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${TRIPS_PATH}/${input.tripId}/fiscal-readiness`,
      })
      return adapters.tripFiscalReadinessFromApi(readEnvelopeData(response))
    },
    async linkTripDocument(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          freightCalculationId: input.freightCalculationId,
          nfeDocumentId: input.nfeDocumentId,
        }),
        dependencies,
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/documents`,
      })
      return adapters.tripDocumentFromApi(readEnvelopeData(response))
    },
    async listTrips(input) {
      const search = buildSearch(input, {
        createdFrom: input.filters?.createdFrom,
        createdUntil: input.filters?.createdUntil,
        driverIdEq: input.filters?.driverIdEq,
        statusEq: input.filters?.statusEq,
        vehicleIdEq: input.filters?.vehicleIdEq,
      })
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${TRIPS_PATH}?${search}`,
      })
      return adapters.tripListFromApi(response)
    },
    async listDeliveryAddressHistory(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${documentPath(input)}/delivery-address-history`,
      })
      return adapters.deliveryAddressHistoryFromApi(response)
    },
    async overrideDeliveryAddress(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          newAddress: input.newAddress,
          newLabel: input.newLabel,
          reason: input.reason,
          requestedBy: input.requestedBy,
        }),
        dependencies,
        method: 'POST',
        path: `${documentPath(input)}/delivery-address`,
      })
      return adapters.deliveryAddressOverrideFromApi(readEnvelopeData(response))
    },
    async planTripRoute(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/plan-route`,
      })
      return adapters.planTripRouteResultFromApi(readEnvelopeData(response))
    },
    async releaseTripDocument(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'DELETE',
        path: documentPath(input),
      })
      return adapters.tripDocumentFromApi(readEnvelopeData(response))
    },
    async reorderTripStops(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ stopIds: input.stopIds }),
        dependencies,
        method: 'PATCH',
        path: `${TRIPS_PATH}/${input.tripId}/stops/order`,
      })
      return adapters.reorderTripStopsResultFromApi(readEnvelopeData(response))
    },
    async transitionTripDocument(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          note: input.note ?? null,
          returnReason: input.returnReason ?? null,
        }),
        dependencies,
        method: 'POST',
        path: `${documentPath(input)}/${input.action}`,
      })
      return adapters.transitionTripDocumentResultFromApi(readEnvelopeData(response))
    },
  }
}
