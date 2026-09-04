/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  NFE_DOCUMENTS_PATH,
  ROUTE_SUGGESTIONS_PATH,
  SCAN_LOOKUP_LIMIT,
  TRIP_ERROR,
  TRIPS_PATH,
} from './trip.constant'
import {
  acceptedMultiVehicleSuggestionFromApi,
  multiVehicleSuggestionFromApi,
} from './multiVehicleSuggestion.validation'
import type {
  AcceptedMultiVehicleSuggestion,
  CreateMultiVehicleSuggestionInput,
  MultiVehicleSuggestion,
  TripCandidateDocumentPage,
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
  LinkTripDocumentsBatchInput,
  LinkTripDocumentsBatchResult,
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
  RegisteredOccurrence,
  TripDocumentProduct,
  TripOccurrence,
  TripListInput,
  TripPage,
} from './trip.types'
import type { DeliveryProof } from './deliveryProof.service'
import {
  DELIVERY_PROOF_OVERRIDES_PATH,
  DELIVERY_PROOF_SETTINGS_PATH,
  isDeliveryProofFieldSettings,
  isDeliveryProofSettingsOverride,
  type DeliveryProofFieldSettings,
  type DeliveryProofSettingsOverride,
} from './deliveryProofSettings.service'
import type { RouteGeometry } from './routeGeometry.service'
import type { OccurrenceType } from './occurrence.constant'
import { isRecord, isString } from './tripGuards.validation'

/** Spec 079: a configuração é da empresa, não da viagem — ligar vale para toda viagem. */
const OCCURRENCE_TYPES_PATH = '/company-settings/occurrence-types'
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
  acceptMultiVehicleSuggestion: (
    input: Readonly<{ suggestionId: string }>,
  ) => Promise<AcceptedMultiVehicleSuggestion>
  createMultiVehicleSuggestion: (
    input: CreateMultiVehicleSuggestionInput,
  ) => Promise<MultiVehicleSuggestion>
  readMultiVehicleSuggestion: (
    input: Readonly<{ suggestionId: string }>,
  ) => Promise<MultiVehicleSuggestion>
  listNfeDocuments: (
    input: Readonly<{ cursor: null | string; limit: number; signal?: AbortSignal }>,
  ) => Promise<TripCandidateDocumentPage>
  /** Entregar passou pela máquina de estados na API, então devolve o estado da viagem junto. */
  deliverTripDocument: (input: TripDocumentActionInput) => Promise<TransitionTripDocumentResult>
  dispatchTrip: (input: DispatchTripInput) => Promise<DispatchTripResult>
  readDeliveryProofs: (input: TripDocumentActionInput) => Promise<readonly DeliveryProof[]>
  readRouteGeometry: (input: Readonly<{ tripId: string }>) => Promise<RouteGeometry>
  readPointsRouteGeometry: (
    input: Readonly<{ points: readonly Readonly<{ latitude: number; longitude: number }>[] }>,
  ) => Promise<RouteGeometry>
  readTripOccurrences: (input: TripDocumentActionInput) => Promise<readonly TripOccurrence[]>
  listOccurrenceTypes: () => Promise<readonly OccurrenceType[]>
  readDeliveryProofSettings: () => Promise<DeliveryProofFieldSettings>
  saveDeliveryProofSettings: (
    input: DeliveryProofFieldSettings,
  ) => Promise<DeliveryProofFieldSettings>
  listDeliveryProofOverrides: () => Promise<readonly DeliveryProofSettingsOverride[]>
  replaceDeliveryProofOverrides: (
    input: Readonly<{ overrides: readonly DeliveryProofSettingsOverride[] }>,
  ) => Promise<readonly DeliveryProofSettingsOverride[]>
  saveOccurrenceType: (
    input: Readonly<{
      active: boolean
      emailTemplateKey: null | string
      name: string
      notifies: boolean
      occurrenceTypeId: null | string
      stage: 'delivery' | 'separation'
    }>,
  ) => Promise<OccurrenceType>
  correctGeocodedAddress: (
    input: Readonly<{ addressKey: string; latitude: string; longitude: string }>,
  ) => Promise<void>
  registerTripOccurrence: (
    input: TripDocumentActionInput & {
      readonly note: string
      readonly occurrenceTypeId: string
      readonly productCode: string
    },
  ) => Promise<RegisteredOccurrence>
  readTripDocumentProducts: (
    input: TripDocumentActionInput,
  ) => Promise<readonly TripDocumentProduct[]>
  findNfeDocumentByAccessKey: (
    input: FindNfeDocumentByAccessKeyInput,
  ) => Promise<null | ScannedNfeDocument>
  createTripCteBatch: (
    input: Readonly<{ tripDocumentIds?: readonly string[]; tripId: string }>,
  ) => Promise<TripCteBatchResult>
  getTrip: (input: Readonly<{ tripId: string }>) => Promise<TripDetail>
  readFiscalReadiness: (input: Readonly<{ tripId: string }>) => Promise<TripFiscalReadiness>
  setTripMdfeRequirement: (input: SetTripMdfeRequirementInput) => Promise<TripMdfeRequirement>
  linkTripDocument: (input: LinkTripDocumentInput) => Promise<TripDocument>
  linkTripDocumentsBatch: (
    input: LinkTripDocumentsBatchInput,
  ) => Promise<LinkTripDocumentsBatchResult>
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

function readDeliveryProofOverrides(input: unknown): readonly DeliveryProofSettingsOverride[] {
  if (!isRecord(input) || !Array.isArray(input.overrides)) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  if (!input.overrides.every(isDeliveryProofSettingsOverride)) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  return input.overrides
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
    async acceptMultiVehicleSuggestion(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'POST',
        path: `${ROUTE_SUGGESTIONS_PATH}/${input.suggestionId}/accept`,
      })
      return acceptedMultiVehicleSuggestionFromApi(readEnvelopeData(response))
    },
    async createMultiVehicleSuggestion(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          nfeDocumentIds: input.nfeDocumentIds,
          vehicles: input.vehicles,
        }),
        dependencies,
        method: 'POST',
        path: `${ROUTE_SUGGESTIONS_PATH}/multi-vehicle`,
      })
      return multiVehicleSuggestionFromApi(readEnvelopeData(response))
    },
    async readMultiVehicleSuggestion(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${ROUTE_SUGGESTIONS_PATH}/${input.suggestionId}`,
      })
      return multiVehicleSuggestionFromApi(readEnvelopeData(response))
    },
    async deliverTripDocument(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'POST',
        path: `${documentPath(input)}/deliver`,
      })
      return adapters.transitionTripDocumentResultFromApi(readEnvelopeData(response))
    },
    async readTripDocumentProducts(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${documentPath(input)}/products`,
      })
      return adapters.documentProductsFromApi(readEnvelopeData(response))
    },
    async correctGeocodedAddress(input) {
      await authorizedRequest({
        body: JSON.stringify({ latitude: input.latitude, longitude: input.longitude }),
        dependencies,
        method: 'PATCH',
        /**
         * ⚠️ A chave **não é UUID** — é `cityCode|postalCode|number`. Sem `encodeURIComponent` o
         * pipe e a barra quebram o caminho, e o servidor responde 404 para um endereço que existe.
         */
        path: `/geocoded-addresses/${encodeURIComponent(input.addressKey)}`,
      })
    },
    async listOccurrenceTypes() {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: OCCURRENCE_TYPES_PATH,
      })
      return adapters.occurrenceTypesFromApi(readEnvelopeData(response))
    },
    async saveOccurrenceType(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          active: input.active,
          emailTemplateKey: input.emailTemplateKey,
          name: input.name,
          notifies: input.notifies,
          occurrenceTypeId: input.occurrenceTypeId,
          stage: input.stage,
        }),
        dependencies,
        method: 'PUT',
        path: OCCURRENCE_TYPES_PATH,
      })
      return adapters.occurrenceTypeFromApi(readEnvelopeData(response))
    },
    async readDeliveryProofSettings() {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: DELIVERY_PROOF_SETTINGS_PATH,
      })
      const data = readEnvelopeData(response)
      if (!isDeliveryProofFieldSettings(data)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
      return data
    },
    async saveDeliveryProofSettings(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          photo: input.photo,
          receiverDocument: input.receiverDocument,
          receiverName: input.receiverName,
          signature: input.signature,
        }),
        dependencies,
        method: 'PUT',
        path: DELIVERY_PROOF_SETTINGS_PATH,
      })
      const data = readEnvelopeData(response)
      if (!isDeliveryProofFieldSettings(data)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
      return data
    },
    async listDeliveryProofOverrides() {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: DELIVERY_PROOF_OVERRIDES_PATH,
      })
      return readDeliveryProofOverrides(readEnvelopeData(response))
    },
    /** O corpo do `PUT` é o conjunto inteiro — o que não veio sai. */
    async replaceDeliveryProofOverrides(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          overrides: input.overrides.map((override) => ({
            photo: override.photo,
            receiverDocument: override.receiverDocument,
            receiverName: override.receiverName,
            signature: override.signature,
            taxId: override.taxId,
          })),
        }),
        dependencies,
        method: 'PUT',
        path: DELIVERY_PROOF_OVERRIDES_PATH,
      })
      return readDeliveryProofOverrides(readEnvelopeData(response))
    },
    async readTripOccurrences(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${documentPath(input)}/occurrences`,
      })
      return adapters.occurrencesFromApi(readEnvelopeData(response))
    },
    async registerTripOccurrence(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          note: input.note,
          occurrenceTypeId: input.occurrenceTypeId,
          productCode: input.productCode,
        }),
        dependencies,
        method: 'POST',
        path: `${documentPath(input)}/occurrences`,
      })
      return adapters.registeredOccurrenceFromApi(readEnvelopeData(response))
    },
    async readDeliveryProofs(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${documentPath(input)}/proof`,
      })
      return adapters.deliveryProofsFromApi(readEnvelopeData(response))
    },
    /**
     * Consulta **própria**, fora do detalhe: a chamada ao OSRM custou 63 ms medidos, e o detalhe é
     * a leitura que abre a tela inteira. O mapa desenha as paradas e engrossa a linha depois.
     */
    async readRouteGeometry(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${TRIPS_PATH}/${input.tripId}/route-geometry`,
      })
      return adapters.routeGeometryFromApi(readEnvelopeData(response))
    },
    /**
     * A linha da estrada para pontos que ainda não são viagem — o mapa da montagem. Mesma resposta
     * da rota da viagem, e por isso o mesmo adaptador: `unavailable` com lista vazia quando o
     * roteirizador não responde, nunca uma reta devolvida como se fosse estrada.
     */
    async readPointsRouteGeometry(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ points: input.points }),
        dependencies,
        method: 'POST',
        path: '/route-geometry',
      })
      return adapters.routeGeometryFromApi(readEnvelopeData(response))
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
    async linkTripDocumentsBatch(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ nfeDocumentIds: input.nfeDocumentIds }),
        dependencies,
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/documents/batch`,
      })
      return adapters.linkTripDocumentsBatchResultFromApi(readEnvelopeData(response))
    },
    async listNfeDocuments(input) {
      const search = buildSearch({ cursor: input.cursor, limit: input.limit }, {})
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${NFE_DOCUMENTS_PATH}?${search}`,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })
      return adapters.tripCandidateDocumentPageFromApi(response)
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
    /**
     * Lista vazia é omitida: para a API, ausência e vazio são a viagem inteira, e mandar `[]` daria
     * a impressão de recorte onde não há.
     */
    async createTripCteBatch(input) {
      const chosen = input.tripDocumentIds ?? []
      const response = await authorizedRequest({
        ...(chosen.length === 0 ? {} : { body: JSON.stringify({ tripDocumentIds: [...chosen] }) }),
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
