/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  NFE_DOCUMENTS_PATH,
  ROUTE_SUGGESTIONS_PATH,
  SCAN_LOOKUP_LIMIT,
  TRIP_ERROR,
  TRIPS_PATH,
  TRIP_CARGO_LAYOUTS_PATH,
  TRIP_DOCUMENT_REVIEWS_PATH,
  TRIP_FIELD_OCCURRENCE_TYPES_PATH,
} from './trip.constant'
import { createTripReviewAdapters } from './tripReview.validation'
import type {
  TripDocumentReview,
  TripDocumentReviewStatus,
  TripReviewPreview,
  TripReviewPreviewInput,
  TripReviewRelease,
  TripSwapSuggestions,
} from './tripReview.types'
import {
  acceptedMultiVehicleSuggestionFromApi,
  multiVehicleProposalFromApi,
  multiVehicleSuggestionFromApi,
} from './multiVehicleSuggestion.validation'
import type {
  AcceptedMultiVehicleSuggestion,
  CreateMultiVehicleSuggestionInput,
  MultiVehicleProposal,
  MultiVehicleSuggestion,
  TripCandidateDocumentPage,
  BatchStatusInput,
  BatchStatusResult,
  CancelTripResult,
  ConfirmLoadTripInput,
  CreateTripBody,
  DeliveryAddressHistoryInput,
  DeliveryAddressOverride,
  DispatchTripInput,
  DispatchTripResult,
  FieldDeliverDocumentInput,
  FieldOccurrenceType,
  FieldReportIdResult,
  FieldReturnDocumentInput,
  FieldSettlementResult,
  FieldTripStepResult,
  FindNfeDocumentByAccessKeyInput,
  RegisterFieldOccurrencesInput,
  LinkTripDocumentInput,
  LinkTripDocumentsBatchInput,
  LinkTripDocumentsBatchResult,
  OverrideDeliveryAddressInput,
  PlanTripRouteResult,
  ReadTripAllowedActionsInput,
  ReorderTripStopsInput,
  ReorderTripStopsResult,
  ReportFieldDeliveryInput,
  ReportFieldDeliveryResult,
  ReportStopArrivalInput,
  ReportStopOccurrenceInput,
  ScannedNfeDocument,
  StartFieldTripInput,
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
  TripCargoPreview,
  TripCargoLayoutPoll,
} from './trip.types'
import { parseTripAllowedActions, type TripAllowedActions } from './tripAllowedActions.validation'
import type { DeliveryProof } from './deliveryProof.service'
import {
  DELIVERY_PROOF_OVERRIDES_PATH,
  DELIVERY_PROOF_SETTINGS_PATH,
  isDeliveryProofFieldSettings,
  isDeliveryProofSettingsOverride,
  type DeliveryProofFieldSettings,
  type DeliveryProofSettingsOverride,
} from './deliveryProofSettings.service'
import type { RouteChoice, RouteGeometry } from './routeGeometry.service'
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
  /** Spec 156 T5: `POST /trips/:id/confirm-load` — o mesmo caso de uso do motorista, com o alvo. */
  confirmLoadTrip: (input: ConfirmLoadTripInput) => Promise<FieldTripStepResult>
  createTrip: (input: CreateTripBody) => Promise<TripDetail>
  /**
   * Spec 110 D5a: `vehicleIds` ausente aceita a proposta inteira — o corpo de sempre. Com a lista,
   * só os marcados viram viagem, e o que sobra volta ao maço porque nunca saiu dele.
   */
  acceptMultiVehicleSuggestion: (
    input: Readonly<{
      /** A ordem escolhida à mão, por veículo. Ausente é a ordem do roteirizador. */
      stopOrderByVehicle?: readonly Readonly<{
        orderedAddressKeys: readonly string[]
        vehicleId: string
      }>[]
      suggestionId: string
      vehicleIds?: readonly string[]
      /** Spec 148 T7: as plantas da prévia de onde soltar as notas que não couberam. */
      releaseUnplacedFromLayoutIds?: readonly string[]
      /** Spec 153: a rota vista por caminhão. Ausente é o critério padrão do servidor. */
      routeChoiceByVehicle?: readonly Readonly<{ routeChoice: RouteChoice; vehicleId: string }>[]
    }>,
  ) => Promise<AcceptedMultiVehicleSuggestion>
  createMultiVehicleSuggestion: (
    input: CreateMultiVehicleSuggestionInput,
  ) => Promise<MultiVehicleSuggestion>
  readMultiVehicleSuggestion: (
    input: Readonly<{ suggestionId: string }>,
  ) => Promise<MultiVehicleSuggestion>
  /**
   * Spec 108: a mesma rota da leitura, **com as paradas** — é o que a prévia mostra antes de existir
   * viagem nenhuma. A leitura sem paradas continua servindo ao poll, que só olha o estado.
   */
  readMultiVehicleProposal: (
    input: Readonly<{ suggestionId: string }>,
  ) => Promise<MultiVehicleProposal>
  listNfeDocuments: (
    input: Readonly<{ cursor: null | string; limit: number; signal?: AbortSignal }>,
  ) => Promise<TripCandidateDocumentPage>
  /**
   * Spec 156 T8b, ADR-0067: entrega com autoria pelo escritório, `trip.report-on-behalf`.
   * Multipart — a foto entra só na T11 (`FieldDeliveryWizard`).
   */
  fieldDeliverDocument: (input: FieldDeliverDocumentInput) => Promise<FieldSettlementResult>
  /** Spec 156 T8b, ADR-0067: devolução com autoria pelo escritório, `trip.report-on-behalf`. */
  fieldReturnDocument: (input: FieldReturnDocumentInput) => Promise<FieldSettlementResult>
  dispatchTrip: (input: DispatchTripInput) => Promise<DispatchTripResult>
  readDeliveryProofs: (input: TripDocumentActionInput) => Promise<readonly DeliveryProof[]>
  readRouteGeometry: (input: Readonly<{ tripId: string }>) => Promise<RouteGeometry>
  /** A carga antes de a viagem existir: notas, veículo e a ordem que o operador montou no mapa. */
  previewCargo: (
    input: Readonly<{
      /** Spec 100: quem amarra a carga empilha até o teto — o desenho depende de quem dirige. */
      driverIds: readonly string[]
      nfeDocumentIds: readonly string[]
      stopOrder: readonly string[]
      vehicleId: string
    }>,
  ) => Promise<TripCargoPreview>
  /** Spec 145 T11: pergunta de novo pela planta enquanto ela está `pending`. */
  readCargoLayout: (
    input: Readonly<{ layoutId: string; signal?: AbortSignal }>,
  ) => Promise<TripCargoLayoutPoll>
  /** Spec 148 T7: a fila das notas que não couberam, por viagem de origem. */
  listTripDocumentReviews: (
    input: Readonly<{ status?: TripDocumentReviewStatus; tripId: string }>,
  ) => Promise<readonly TripDocumentReview[]>
  /** D10: o botão "Tirar do caminhão as N notas que não couberam". Repetir devolve as mesmas. */
  releaseUnplacedDocuments: (
    input: Readonly<{ layoutId: string; tripId: string }>,
  ) => Promise<TripReviewRelease>
  readSwapSuggestions: (input: Readonly<{ reviewId: string }>) => Promise<TripSwapSuggestions>
  previewReviewChange: (input: TripReviewPreviewInput) => Promise<TripReviewPreview>
  moveReview: (
    input: Readonly<{ reviewId: string; targetTripId: string; validatedLayoutId: string }>,
  ) => Promise<TripDocumentReview>
  swapReview: (
    input: Readonly<{ outTripDocumentId: string; reviewId: string; validatedLayoutId: string }>,
  ) => Promise<Readonly<{ review: TripDocumentReview; swappedOut: TripDocumentReview }>>
  readPointsRouteGeometry: (
    input: Readonly<{
      points: readonly Readonly<{ latitude: number; longitude: number }>[]
      /** Spec 090 T7: sem veículo escolhido não há eixo a contar — o pedágio vem `null`. */
      vehicleId: null | string
    }>,
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
  /** Spec 153: `routeChoice` ausente é o critério padrão do servidor — e aí o corpo não vai. */
  planTripRoute: (
    input: Readonly<{ routeChoice?: RouteChoice; tripId: string }>,
  ) => Promise<PlanTripRouteResult>
  releaseTripDocument: (input: TripDocumentActionInput) => Promise<TripDocument>
  reorderTripStops: (input: ReorderTripStopsInput) => Promise<ReorderTripStopsResult>
  /** Spec 156 T7.2: rota própria, fora do detalhe (t7-design §2.4, ressalva M1). */
  readTripAllowedActions: (input: ReadTripAllowedActionsInput) => Promise<TripAllowedActions>
  /** Spec 156 T5: `POST /trips/:id/stops/:stopId/arrive`. */
  reportStopArrival: (input: ReportStopArrivalInput) => Promise<FieldReportIdResult>
  /** Spec 156 T5: `POST /trips/:id/stops/:stopId/occurrences`. */
  reportStopOccurrence: (input: ReportStopOccurrenceInput) => Promise<FieldReportIdResult>
  /** Spec 156 T5: `POST /trips/:id/start-route` — leva a viagem a `on_delivery_route`. */
  startFieldTrip: (input: StartFieldTripInput) => Promise<FieldTripStepResult>
  /** Spec 156 T9: `GET /trips/occurrence-types/field` — o catálogo do lote de ocorrência de nota. */
  readFieldOccurrenceTypes: () => Promise<readonly FieldOccurrenceType[]>
  /**
   * Spec 156 T7.3/T7b/T9: `POST /trips/:id/documents/field-occurrences` — ocorrência de campo para
   * uma ou várias notas (até 50), multipart, com foto opcional para o lote inteiro.
   */
  registerFieldOccurrences: (
    input: RegisterFieldOccurrencesInput,
  ) => Promise<readonly Readonly<{ documentId: string; id: string }>[]>
  /**
   * Spec 156 T12: `POST /trips/:id/documents/:documentId/field-delivery` — uma chamada por nota,
   * multipart, com a própria `Idempotency-Key` (T6 evidence: `deliveredAt`, `receiverName`,
   * `receiverDocument`, `driverId` opcionais, `file` sempre presente nesta tela).
   */
  reportFieldDelivery: (input: ReportFieldDeliveryInput) => Promise<ReportFieldDeliveryResult>
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
    /** Multipart — nunca junto com `body`. O `content-type` (com a fronteira) é o próprio `fetch`. */
    form?: FormData
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
  if (input.form !== undefined) requestInit.body = input.form
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

/** Spec 156 T8b: a resposta comum de `field-delivery`/`field-return` (T6). */
function readFieldSettlementResult(response: unknown): FieldSettlementResult {
  const data = readEnvelopeData(response)
  if (
    !isRecord(data) ||
    typeof data.alreadySettled !== 'boolean' ||
    !isString(data.id) ||
    typeof data.stopCompleted !== 'boolean' ||
    typeof data.tripCompleted !== 'boolean'
  ) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  return {
    alreadySettled: data.alreadySettled,
    id: data.id,
    stopCompleted: data.stopCompleted,
    tripCompleted: data.tripCompleted,
  }
}

/**
 * Spec 156 T5: `confirm-load`, `start-route` e `arrive` levam corpo vazio ou só `driverId` — o
 * espalhamento condicional evita `body: undefined` explícito, que `exactOptionalPropertyTypes`
 * recusa mesmo quando o valor é o mesmo de "propriedade ausente".
 */
function officeDriverSelectionBody(driverId: string | undefined): Readonly<{ body?: string }> {
  return driverId === undefined ? {} : { body: JSON.stringify({ driverId }) }
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
  const reviewAdapters = createTripReviewAdapters()

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
    async confirmLoadTrip(input) {
      const response = await authorizedRequest({
        ...officeDriverSelectionBody(input.driverId),
        dependencies,
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/confirm-load`,
      })
      return adapters.fieldTripStepResultFromApi(readEnvelopeData(response))
    },
    async startFieldTrip(input) {
      const response = await authorizedRequest({
        ...officeDriverSelectionBody(input.driverId),
        dependencies,
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/start-route`,
      })
      return adapters.fieldTripStepResultFromApi(readEnvelopeData(response))
    },
    async reportStopArrival(input) {
      const response = await authorizedRequest({
        ...officeDriverSelectionBody(input.driverId),
        dependencies,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/stops/${input.stopId}/arrive`,
      })
      return adapters.fieldReportIdResultFromApi(readEnvelopeData(response))
    },
    async reportStopOccurrence(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          description: input.description,
          distanceMeters: input.distanceMeters,
          documentId: input.documentId,
          driverId: input.driverId,
          kind: input.kind,
        }),
        dependencies,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/stops/${input.stopId}/occurrences`,
      })
      return adapters.fieldReportIdResultFromApi(readEnvelopeData(response))
    },
    async readFieldOccurrenceTypes() {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: TRIP_FIELD_OCCURRENCE_TYPES_PATH,
      })
      return adapters.fieldOccurrenceTypesFromApi(readEnvelopeData(response))
    },
    async registerFieldOccurrences(input) {
      const form = new FormData()
      for (const documentId of input.documentIds) form.append('documentIds', documentId)
      form.set('occurrenceTypeId', input.occurrenceTypeId)
      form.set('note', input.note)
      if (input.driverId !== undefined) form.set('driverId', input.driverId)
      if (input.file !== undefined) form.set('file', input.file)

      const response = await authorizedRequest({
        dependencies,
        form,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: `${TRIPS_PATH}/${input.tripId}/documents/field-occurrences`,
      })
      return adapters.fieldOccurrenceBatchResultFromApi(readEnvelopeData(response))
    },
    async reportFieldDelivery(input) {
      const form = new FormData()
      form.set('deliveredAt', input.deliveredAt)
      form.set('file', input.imageBlob)
      if (input.driverId !== undefined) form.set('driverId', input.driverId)
      if (input.receiverDocument !== undefined) form.set('receiverDocument', input.receiverDocument)
      if (input.receiverName !== undefined) form.set('receiverName', input.receiverName)

      const response = await authorizedRequest({
        dependencies,
        form,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: `${documentPath(input)}/field-delivery`,
      })
      return adapters.reportFieldDeliveryResultFromApi(readEnvelopeData(response))
    },
    async readTripAllowedActions(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${TRIPS_PATH}/${input.tripId}/allowed-actions`,
      })
      return parseTripAllowedActions({
        trip: { documentIds: input.documentIds, stopIds: input.stopIds },
        value: readEnvelopeData(response),
      })
    },
    async createTrip(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          /** Spec 143 D4: ausente sugere pela duração — nunca `dailyAllowanceDays: undefined`. */
          ...(input.dailyAllowanceDays === undefined
            ? {}
            : { dailyAllowanceDays: input.dailyAllowanceDays }),
          driverIds: input.driverIds,
          vehicleId: input.vehicleId,
        }),
        dependencies,
        method: 'POST',
        path: TRIPS_PATH,
      })
      return adapters.tripDetailFromApi(readEnvelopeData(response))
    },
    async acceptMultiVehicleSuggestion(input) {
      const response = await authorizedRequest({
        /**
         * ⚠️ Sem seleção e sem ordem o corpo **não é enviado**: a rota lê corpo opcional pela
         * ausência de `content-type`, e mandar `{}` faria toda instalação anterior a esta spec
         * passar por um caminho novo sem precisar.
         */
        ...(input.vehicleIds === undefined &&
        input.stopOrderByVehicle === undefined &&
        input.releaseUnplacedFromLayoutIds === undefined &&
        input.routeChoiceByVehicle === undefined
          ? {}
          : {
              body: JSON.stringify({
                ...(input.releaseUnplacedFromLayoutIds === undefined
                  ? {}
                  : { releaseUnplacedFromLayoutIds: input.releaseUnplacedFromLayoutIds }),
                ...(input.routeChoiceByVehicle === undefined
                  ? {}
                  : { routeChoiceByVehicle: input.routeChoiceByVehicle }),
                ...(input.stopOrderByVehicle === undefined
                  ? {}
                  : { stopOrderByVehicle: input.stopOrderByVehicle }),
                ...(input.vehicleIds === undefined ? {} : { vehicleIds: input.vehicleIds }),
              }),
            }),
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
    async readMultiVehicleProposal(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${ROUTE_SUGGESTIONS_PATH}/${input.suggestionId}`,
      })
      return multiVehicleProposalFromApi(readEnvelopeData(response))
    },
    async readMultiVehicleSuggestion(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${ROUTE_SUGGESTIONS_PATH}/${input.suggestionId}`,
      })
      return multiVehicleSuggestionFromApi(readEnvelopeData(response))
    },
    async fieldDeliverDocument(input) {
      const form = new FormData()
      form.set('deliveredAt', input.deliveredAt)
      if (input.driverId !== undefined) form.set('driverId', input.driverId)

      const response = await authorizedRequest({
        dependencies,
        form,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: `${documentPath(input)}/field-delivery`,
      })
      return readFieldSettlementResult(response)
    },
    async fieldReturnDocument(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          driverId: input.driverId,
          reason: input.reason,
          returnedAt: input.returnedAt,
        }),
        dependencies,
        idempotencyKey: input.idempotencyKey,
        method: 'POST',
        path: `${documentPath(input)}/field-return`,
      })
      return readFieldSettlementResult(response)
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
    async previewCargo(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          driverIds: input.driverIds,
          nfeDocumentIds: input.nfeDocumentIds,
          stopOrder: input.stopOrder,
          vehicleId: input.vehicleId,
        }),
        dependencies,
        method: 'POST',
        /**
         * ⚠️ **Com o prefixo `/trips`**, ao contrário de `/route-geometry` logo abaixo: a rota da
         * prévia mora em `${API_TRIPS_PATH}/cargo-preview` e a da geometria por pontos é de raiz.
         * Sem o prefixo o navegador levava 403 no preflight, a requisição falhava, `preview` ficava
         * `null` — e o painel de carga da montagem simplesmente não renderizava, sem erro na tela.
         */
        path: `${TRIPS_PATH}/cargo-preview`,
      })
      return adapters.tripCargoPreviewFromApi(readEnvelopeData(response))
    },
    async readCargoLayout(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${TRIP_CARGO_LAYOUTS_PATH}/${encodeURIComponent(input.layoutId)}`,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      })
      return adapters.tripCargoLayoutPollFromApi(readEnvelopeData(response))
    },
    async listTripDocumentReviews(input) {
      const search = new URLSearchParams({
        status: input.status ?? 'pending',
        tripId: input.tripId,
      })
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${TRIP_DOCUMENT_REVIEWS_PATH}?${search.toString()}`,
      })
      return reviewAdapters.reviewsFromApi(readEnvelopeData(response))
    },
    async releaseUnplacedDocuments(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'POST',
        path: `${TRIPS_PATH}/${encodeURIComponent(input.tripId)}/cargo-layouts/${encodeURIComponent(input.layoutId)}/release-unplaced`,
      })
      return reviewAdapters.releaseFromApi(readEnvelopeData(response))
    },
    async readSwapSuggestions(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${TRIP_DOCUMENT_REVIEWS_PATH}/${encodeURIComponent(input.reviewId)}/swap-suggestions`,
      })
      return reviewAdapters.swapSuggestionsFromApi(readEnvelopeData(response))
    },
    async previewReviewChange(input) {
      const { reviewId, ...change } = input
      const response = await authorizedRequest({
        body: JSON.stringify(change),
        dependencies,
        method: 'POST',
        path: `${TRIP_DOCUMENT_REVIEWS_PATH}/${encodeURIComponent(reviewId)}/move-preview`,
      })
      return reviewAdapters.previewFromApi(readEnvelopeData(response))
    },
    async moveReview(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          targetTripId: input.targetTripId,
          validatedLayoutId: input.validatedLayoutId,
        }),
        dependencies,
        method: 'POST',
        path: `${TRIP_DOCUMENT_REVIEWS_PATH}/${encodeURIComponent(input.reviewId)}/move`,
      })
      return reviewAdapters.reviewFromApi(readEnvelopeData(response))
    },
    async swapReview(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({
          outTripDocumentId: input.outTripDocumentId,
          validatedLayoutId: input.validatedLayoutId,
        }),
        dependencies,
        method: 'POST',
        path: `${TRIP_DOCUMENT_REVIEWS_PATH}/${encodeURIComponent(input.reviewId)}/swap`,
      })
      const data = readEnvelopeData(response)
      if (typeof data !== 'object' || data === null) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
      const swapped = data as { review?: unknown; swappedOut?: unknown }
      return {
        review: reviewAdapters.reviewFromApi(swapped.review),
        swappedOut: reviewAdapters.reviewFromApi(swapped.swappedOut),
      }
    },
    async readPointsRouteGeometry(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ points: input.points, vehicleId: input.vehicleId }),
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
        ...(input.routeChoice === undefined
          ? {}
          : { body: JSON.stringify({ routeChoice: input.routeChoice }) }),
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
        body: JSON.stringify({ note: input.note ?? null }),
        dependencies,
        method: 'POST',
        path: `${documentPath(input)}/${input.action}`,
      })
      return adapters.transitionTripDocumentResultFromApi(readEnvelopeData(response))
    },
  }
}
