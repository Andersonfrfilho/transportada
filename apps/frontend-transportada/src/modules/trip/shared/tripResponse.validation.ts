/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeliveryProof } from './deliveryProof.service'
import { OCCURRENCE_ATTACHMENT_MODES, type OccurrenceType } from './occurrence.constant'
import { TRIP_FIELD_CHANNELS, TRIP_TIMELINE_KINDS } from './trip.types'
import type {
  FieldOccurrenceType,
  RegisteredOccurrence,
  TripDocumentProduct,
  OccurrenceCancellation,
  OccurrenceCorrection,
  OccurrenceProduct,
  TripOccurrence,
  TripCargoLayout,
  TripCargoLayoutPoll,
  TripCargoLayoutState,
  TripCargoPreview,
  TripCargoWeight,
  TripOccupancy,
  TripPendingMeasurement,
  TripTimelineDocumentReference,
  TripTimelineItem,
  TripTimelineOccurrenceReference,
  TripTimelinePage,
  TripTimelineStopReference,
  TripWeightConcentration,
} from './trip.types'
import {
  AXLE_COUNT_SOURCES,
  ROUTE_CHOICE_CRITERIA,
  ROUTE_COST_GAPS,
  DEPOT_ORIGIN_SOURCES,
  ROUTE_DEPOT_ABSENCES,
  ROUTE_GEOMETRY_SOURCES,
  TOLL_CATALOG_STATUSES,
  TOLL_PAYMENT_MODES,
  type RouteGeometry,
  type DepotDescription,
  type RouteGeometryDepot,
  type RouteGeometryLeg,
  type RouteGeometryOption,
  type RouteGeometryToll,
  type RouteGeometryTollBooth,
  type TollCatalogView,
} from './routeGeometry.service'
import {
  BATCH_STATUS_RESULT_KEYS,
  BATCH_STATUS_RESULT_OPTIONAL_KEYS,
  DELIVERY_ADDRESS_OVERRIDE_KEYS,
  STOP_ADDRESS_COMPONENTS_KEYS,
  TRANSITION_RESULT_KEYS,
  TRANSITION_RESULT_OPTIONAL_KEYS,
  TRIP_DETAIL_KEYS,
  TRIP_DETAIL_OPTIONAL_KEYS,
  DELIVERY_PROOF_KEYS,
  DELIVERY_PROOF_RECEIVED_BY_KEYS,
  DELIVERY_PROOF_RECEIVED_BY_OPTIONS,
  TRIP_DOCUMENT_PRODUCT_KEYS,
  TRIP_OCCURRENCE_KEYS,
  TRIP_CARGO_WEIGHT_KEYS,
  TRIP_OCCUPANCY_KEYS,
  TRIP_DOCUMENT_DETAIL_KEYS,
  TRIP_DOCUMENT_DETAIL_OPTIONAL_KEYS,
  TRIP_DOCUMENT_FREIGHT_SOURCES,
  TRIP_DOCUMENT_KEYS,
  TRIP_DRIVER_KEYS,
  TRIP_DRIVER_OPTIONAL_KEYS,
  TRIP_ERROR,
  FIELD_REPORT_ID_RESULT_KEYS,
  FIELD_TRIP_STEP_RESULT_KEYS,
  TRIP_AMOUNTS_KEYS,
  TRIP_KEYS,
  TRIP_OPTIONAL_KEYS,
  TRIP_REVENUE_SOURCES,
  TRIP_STATUS_RESULT_KEYS,
  TRIP_STOP_KEYS,
  TRIP_STOP_OPTIONAL_KEYS,
  TRIP_CARGO_LAYOUT_STATE_KEYS,
  TRIP_CARGO_LAYOUT_POLL_KEYS,
  TRIP_OCCURRENCE_OPTIONAL_KEYS,
  FIELD_OCCURRENCE_TYPE_KEYS,
  FIELD_OCCURRENCE_TYPE_OPTIONAL_KEYS,
  REPORT_FIELD_DELIVERY_RESULT_KEYS,
  TRIP_TIMELINE_ITEM_KEYS,
  TRIP_TIMELINE_STOP_REFERENCE_KEYS,
  TRIP_TIMELINE_DOCUMENT_REFERENCE_KEYS,
  TRIP_TIMELINE_OCCURRENCE_REFERENCE_KEYS,
  TRIP_TIMELINE_OCCURRENCE_REFERENCE_OPTIONAL_KEYS,
} from './trip.constant'
import {
  SCANNED_NFE_STATUS,
  TRIP_BATCH_ITEM_OUTCOME,
  TRIP_DISPATCH_BLOCKED_CODES,
  TRIP_DOCUMENT_READINESS_REASONS,
  TRIP_FISCAL_READINESS_STATES,
  TRIP_DESTINATION_ORIGINS,
  TRIP_DOCUMENT_SEPARATION_STATUS,
  TRIP_STATUS,
  CARGO_LAYOUT_STATUSES,
} from './trip.types'
import type {
  AutoDispatchOutcome,
  BatchStatusResult,
  CancelTripResult,
  DeliveryAddressOverride,
  DispatchTripResult,
  FieldReportIdResult,
  FieldTripStepResult,
  PlanTripRouteResult,
  ReportFieldDeliveryResult,
  ReorderTripStopsResult,
  ScannedNfeDocument,
  LinkTripDocumentsBatchResult,
  TripCandidateDocumentPage,
  StopAddressComponents,
  Trip,
  TripDetail,
  TripDocument,
  TripDocumentBatchItemResult,
  TripCteBatchResult,
  TripMdfeRequirement,
  TripDocumentDetail,
  TripDocumentReadiness,
  TripDriverLine,
  TripFiscalReadiness,
  TripPage,
  TripStatus,
  TripStopDetail,
  TransitionTripDocumentResult,
} from './trip.types'
import {
  hasExactKeys,
  hasKeys,
  isBoolean,
  isEveryItem,
  isNullableString,
  isOccurrenceAttachment,
  isOneOf,
  isRecord,
  isString,
  isUnsignedInteger,
} from './tripGuards.validation'

/**
 * Coluna que a listagem de notas pode não ter mandado: ausente é ausência, não resposta inválida —
 * a guarda de forma desta linha é parcial de propósito (ver `isScannedDocument`).
 */
/** Origem fechada: sigla nova na API sem tradução aqui vira ausência, nunca texto cru na tela. */
function readCargoWeightSource(row: unknown): 'estimated' | 'xml' | null {
  const value = isRecord(row) ? row.cargoWeightSource : null
  return value === 'estimated' || value === 'xml' ? value : null
}

function readNullableColumn(row: unknown, column: string): null | string {
  if (!isRecord(row)) return null
  const value = row[column]
  return isString(value) ? value : null
}

function invalid(): Error {
  return new Error(TRIP_ERROR.RESPONSE_INVALID)
}

/** `unavailable` com lista vazia é o único jeito de dizer "não sei o caminho" (spec 079/093). */
const UNAVAILABLE_ROUTE_GEOMETRY: RouteGeometry = {
  cheapestIndex: null,
  choiceReproduced: true,
  costGap: null,
  criterion: null,
  depot: null,
  fastestIndex: null,
  hasChoice: false,
  legs: [],
  frozen: false,
  options: [],
  points: [],
  selectedIndex: null,
  source: 'unavailable',
  toll: null,
}

/**
 * Spec 097: a perna do barracão. ⚠️ Corpo malformado vira `null` — "ninguém pediu barracão" —, e
 * não uma ausência anunciada: inventar aviso a partir de resposta quebrada mandaria o operador
 * cadastrar um barracão que já existe.
 */
/** ⚠️ A coordenada vem como texto, na mesma forma dos pontos do traçado — nunca número. */
function isCoordinate(value: unknown): value is Readonly<{ latitude: string; longitude: string }> {
  return isRecord(value) && isString(value.latitude) && isString(value.longitude)
}

function isGeometryDepot(value: unknown): value is RouteGeometryDepot {
  return (
    isRecord(value) &&
    (value.absence === null || isOneOf(value.absence, ROUTE_DEPOT_ABSENCES)) &&
    (value.originSource === undefined ||
      value.originSource === null ||
      isOneOf(value.originSource, DEPOT_ORIGIN_SOURCES)) &&
    /**
     * ⚠️ Tolerante à ausência, como o `origin` ao lado — e ao contrário do extrato de pedágio, onde
     * o campo é obrigatório. A diferença é deliberada: a perna do barracão já funcionava sem a
     * descrição, e exigi-la faria uma API anterior derrubar o bloco inteiro em vez de mostrá-lo sem
     * a linha nova. Quem lê usa `?? null`.
     */
    (value.description === null ||
      value.description === undefined ||
      isDepotDescription(value.description)) &&
    typeof value.leadingLegs === 'number' &&
    (value.origin === null || value.origin === undefined || isCoordinate(value.origin)) &&
    typeof value.trailingLegs === 'number'
  )
}

function isDepotDescription(value: unknown): value is DepotDescription {
  return (
    isRecord(value) &&
    isString(value.address) &&
    isString(value.legalName) &&
    isNullableString(value.phone) &&
    isString(value.tradeName)
  )
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => isString(entry))
}

function isTripFields(value: Record<string, unknown>): boolean {
  return (
    isString(value.companyId) &&
    isString(value.createdAt) &&
    isStringArray(value.driverNames) &&
    isString(value.id) &&
    (value.requiresMdfe === null || typeof value.requiresMdfe === 'boolean') &&
    isNullableString(value.requiresMdfeReason) &&
    isOneOf(value.status, TRIP_STATUS) &&
    isString(value.updatedAt) &&
    isString(value.vehicleId)
  )
}

function isTrip(value: unknown): value is Trip {
  if (!hasKeys(value, { allowed: [...TRIP_KEYS, ...TRIP_OPTIONAL_KEYS], required: TRIP_KEYS })) {
    return false
  }

  const optional = value as { estimatedArrivalFrozenAt?: unknown; estimatedFinishAt?: unknown }

  return (
    isTripFields(value) &&
    isAbsentOrTripAmounts((value as { amounts?: unknown }).amounts) &&
    isAbsentOrNullableString(optional.estimatedArrivalFrozenAt) &&
    isAbsentOrNullableString(optional.estimatedFinishAt)
  )
}

/**
 * Opcional não é "qualquer coisa" (spec 078 D2): ausente e `null` passam — a API só calcula na
 * listagem —, mas presente com forma errada continua reprovando. `revenueTotal` é obrigatório
 * quando o objeto existe: total de receita ausente seria a coluna imprimindo vazio sem dizer por quê.
 */
function isAbsentOrTripAmounts(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (!hasExactKeys(value, TRIP_AMOUNTS_KEYS)) return false

  return (
    isNullableString(value.documentsTotal) &&
    isOneOf(value.revenueSource, TRIP_REVENUE_SOURCES) &&
    isString(value.revenueTotal)
  )
}

/** Opcional não é "qualquer coisa": ausente passa, presente com forma errada continua reprovando. */
function isAbsentOrNullableString(value: unknown): boolean {
  return value === undefined || isNullableString(value)
}

function isDriverLine(value: unknown): value is TripDriverLine {
  if (
    !hasKeys(value, {
      allowed: [...TRIP_DRIVER_KEYS, ...TRIP_DRIVER_OPTIONAL_KEYS],
      required: TRIP_DRIVER_KEYS,
    })
  ) {
    return false
  }
  return (
    isAbsentOrNullableString(value.driverEmail) &&
    isAbsentOrNullableString(value.driverPhone) &&
    isString(value.driverId) &&
    isString(value.driverName) &&
    /** Spec 156 D11: `null` para quem lê a viagem sem `fleet.read` — o nome continua. */
    isNullableString(value.driverTaxId) &&
    isUnsignedInteger(value.position)
  )
}

function isDocumentFields(value: Record<string, unknown>): boolean {
  return (
    isString(value.createdAt) &&
    isNullableString(value.deliveredAt) &&
    (value.destinationOrigin === null ||
      isOneOf(value.destinationOrigin, TRIP_DESTINATION_ORIGINS)) &&
    isNullableString(value.freightCalculationId) &&
    isString(value.id) &&
    isNullableString(value.loadedAt) &&
    isNullableString(value.nfeDocumentId) &&
    isNullableString(value.releasedAt) &&
    isNullableString(value.returnedAt) &&
    isNullableString(value.returnReason) &&
    isNullableString(value.separatedAt) &&
    isOneOf(value.separationStatus, TRIP_DOCUMENT_SEPARATION_STATUS) &&
    isNullableString(value.stopId) &&
    isString(value.tripId) &&
    isString(value.updatedAt)
  )
}

function isDocument(value: unknown): value is TripDocument {
  if (!hasExactKeys(value, TRIP_DOCUMENT_KEYS)) return false
  return isDocumentFields(value)
}

function isDocumentDetail(value: unknown): value is TripDocumentDetail {
  if (
    !hasKeys(value, {
      allowed: [...TRIP_DOCUMENT_DETAIL_KEYS, ...TRIP_DOCUMENT_DETAIL_OPTIONAL_KEYS],
      required: TRIP_DOCUMENT_DETAIL_KEYS,
    })
  ) {
    return false
  }
  return (
    isDocumentFields(value) &&
    isBoolean(value.cteAuthorized) &&
    isString(value.fiscalStatus) &&
    /** Spec 164 T15: ausente é API anterior ao marcador; presente tem de ser booleano. */
    (value.openOccurrenceCase === undefined || isBoolean(value.openOccurrenceCase)) &&
    /** Spec 185 T6.1: mesma tolerância — ausente é API anterior ao campo (spec 078 D2). */
    (value.leavesBehindOnDispatch === undefined || isBoolean(value.leavesBehindOnDispatch)) &&
    /** Spec 176: ausente é API anterior à feature; presente segue a mesma regra de dinheiro/rótulo. */
    isAbsentOrNullableString(value.freightAmount) &&
    isAbsentOrNullableString(value.freightRuleName) &&
    (value.freightSource === undefined ||
      isOneOf(value.freightSource, TRIP_DOCUMENT_FREIGHT_SOURCES))
  )
}

/**
 * Spec 185 T6.1: cópia por valor de `TryAutoDispatchTripResult` — `details` só existe em
 * `TRIP_HAS_UNSCHEDULED_STOPS`, nunca em `TRIP_HAS_NO_ROUTE` (a API não manda o campo ali).
 */
function isAutoDispatchOutcome(value: unknown): value is AutoDispatchOutcome {
  if (!isRecord(value)) return false
  if (value.outcome === 'dispatched') return hasExactKeys(value, ['outcome'])
  if (value.outcome !== 'blocked') return false
  if (!hasKeys(value, { allowed: ['code', 'details', 'outcome'], required: ['code', 'outcome'] })) {
    return false
  }
  if (!isOneOf(value.code, TRIP_DISPATCH_BLOCKED_CODES)) return false
  return (
    value.details === undefined ||
    (isRecord(value.details) && isEveryItem(value.details.stopIds, isString))
  )
}

function isStopDetail(value: unknown): value is TripStopDetail {
  if (
    !hasKeys(value, {
      allowed: [...TRIP_STOP_KEYS, ...TRIP_STOP_OPTIONAL_KEYS],
      required: TRIP_STOP_KEYS,
    })
  ) {
    return false
  }
  return (
    isString(value.addressKey) &&
    isNullableString(value.arrivedAt) &&
    isNullableString(value.completedAt) &&
    isNullableString(value.deliveryWindowEnd) &&
    isNullableString(value.deliveryWindowStart) &&
    isEveryItem(value.documents, isDocumentDetail) &&
    isString(value.id) &&
    isString(value.label) &&
    isUnsignedInteger(value.sequence) &&
    (value.hasOpenOccurrence === undefined || isBoolean(value.hasOpenOccurrence))
  )
}

function isDetail(value: unknown): value is TripDetail {
  if (
    !hasKeys(value, {
      allowed: [...TRIP_DETAIL_KEYS, ...TRIP_DETAIL_OPTIONAL_KEYS],
      required: TRIP_DETAIL_KEYS,
    })
  ) {
    return false
  }
  return (
    isTripFields(value) &&
    isAbsentOrTripAmounts((value as { amounts?: unknown }).amounts) &&
    /** Spec 156 T8d: opcional (spec 078 D2), mas presente com tipo errado continua reprovando. */
    isAbsentOrNullableString((value as { closeReason?: unknown }).closeReason) &&
    isAbsentOrNullableString((value as { closedAt?: unknown }).closedAt) &&
    isAbsentOrNullableString((value as { closedByName?: unknown }).closedByName) &&
    ((value as { cargoLayoutId?: unknown }).cargoLayoutId === undefined ||
      isNullableString((value as { cargoLayoutId?: unknown }).cargoLayoutId)) &&
    isEveryItem(value.documents, isDocumentDetail) &&
    isEveryItem(value.drivers, isDriverLine) &&
    /** Opcional não é "qualquer coisa": presente com forma errada continua reprovando (D2). */
    (value.cargoWeight === undefined ||
      value.cargoWeight === null ||
      isCargoWeight(value.cargoWeight)) &&
    (value.occupancy === undefined || value.occupancy === null || isOccupancy(value.occupancy)) &&
    (value.cargoLayoutState === undefined || isCargoLayoutState(value.cargoLayoutState)) &&
    isEveryItem(value.stops, isStopDetail)
  )
}

/** Spec 145 D10: chave exata e status fechado — estado estranho reprova, não vira "pendente". */
function isCargoLayoutState(value: unknown): value is TripCargoLayoutState {
  if (!hasExactKeys(value, TRIP_CARGO_LAYOUT_STATE_KEYS)) return false
  return (
    isNullableString(value.computedAt) &&
    isNullableString(value.errorCode) &&
    typeof value.stale === 'boolean' &&
    isOneOf(value.status, CARGO_LAYOUT_STATUSES) &&
    typeof value.truncated === 'boolean'
  )
}

function isStopAddressComponents(value: unknown): value is StopAddressComponents {
  if (!hasExactKeys(value, STOP_ADDRESS_COMPONENTS_KEYS)) return false
  return (
    isNullableString(value.cityCode) &&
    isNullableString(value.number) &&
    isNullableString(value.postalCode)
  )
}

function isDeliveryAddressOverride(value: unknown): value is DeliveryAddressOverride {
  if (!hasExactKeys(value, DELIVERY_ADDRESS_OVERRIDE_KEYS)) return false
  return (
    isString(value.actorUserId) &&
    isString(value.createdAt) &&
    isString(value.id) &&
    isStopAddressComponents(value.newAddress) &&
    isString(value.newLabel) &&
    isStopAddressComponents(value.previousAddress) &&
    isString(value.previousLabel) &&
    isString(value.reason) &&
    isString(value.requestedBy) &&
    isString(value.tripDocumentId)
  )
}

function isTripStatusResult(value: unknown): value is Readonly<{ tripStatus: TripStatus }> {
  return hasExactKeys(value, TRIP_STATUS_RESULT_KEYS) && isOneOf(value.tripStatus, TRIP_STATUS)
}

/** Spec 156 T5: `POST .../confirm-load` e `POST .../start-route` — nenhum recurso nasce ali. */
function isFieldTripStepResult(value: unknown): value is FieldTripStepResult {
  return (
    hasExactKeys(value, FIELD_TRIP_STEP_RESULT_KEYS) &&
    isBoolean(value.changed) &&
    isOneOf(value.status, TRIP_STATUS)
  )
}

/** Spec 156 T5: `POST .../arrive` e `POST .../occurrences` — o id do recurso criado. */
function isFieldReportIdResult(value: unknown): value is FieldReportIdResult {
  return hasExactKeys(value, FIELD_REPORT_ID_RESULT_KEYS) && isString(value.id)
}

/** Spec 156 T6/T12: `POST .../field-delivery` — comprovante gravado na mesma transação. */
function isReportFieldDeliveryResult(value: unknown): value is ReportFieldDeliveryResult {
  return (
    hasExactKeys(value, REPORT_FIELD_DELIVERY_RESULT_KEYS) &&
    isBoolean(value.alreadySettled) &&
    isString(value.id) &&
    isString(value.proofId) &&
    isBoolean(value.stopCompleted) &&
    isBoolean(value.tripCompleted)
  )
}

function isTransitionResult(value: unknown): value is TransitionTripDocumentResult {
  if (
    !hasKeys(value, {
      allowed: [...TRANSITION_RESULT_KEYS, ...TRANSITION_RESULT_OPTIONAL_KEYS],
      required: TRANSITION_RESULT_KEYS,
    })
  ) {
    return false
  }
  return (
    isDocument(value.document) &&
    isOneOf(value.tripStatus, TRIP_STATUS) &&
    (value.autoDispatch === undefined || isAutoDispatchOutcome(value.autoDispatch))
  )
}

/** Cada `outcome` carrega chaves diferentes (`blocked` ganha `reason`) — checar só o que toda
 * variante tem em comum é o suficiente aqui; a tela lê o `reason` quando ele existe. */
function isBatchItemResult(value: unknown): value is TripDocumentBatchItemResult {
  return (
    isRecord(value) &&
    isString(value.documentId) &&
    isOneOf(value.outcome, TRIP_BATCH_ITEM_OUTCOME) &&
    (value.reason === undefined || isString(value.reason))
  )
}

function isBatchStatusResult(value: unknown): value is BatchStatusResult {
  if (
    !hasKeys(value, {
      allowed: [...BATCH_STATUS_RESULT_KEYS, ...BATCH_STATUS_RESULT_OPTIONAL_KEYS],
      required: BATCH_STATUS_RESULT_KEYS,
    })
  ) {
    return false
  }
  return (
    isEveryItem(value.items, isBatchItemResult) &&
    isOneOf(value.tripStatus, TRIP_STATUS) &&
    (value.autoDispatch === undefined || isAutoDispatchOutcome(value.autoDispatch))
  )
}

/**
 * Guarda parcial de propósito: a linha vem da rota de outro módulo, e exigir chave exata faria a
 * tela do separador parar toda vez que a listagem de notas ganhasse uma coluna.
 */
function isScannedDocument(value: unknown): value is ScannedNfeDocument {
  return (
    isRecord(value) &&
    isString(value.accessKey) &&
    isString(value.emitterName) &&
    isString(value.id) &&
    isString(value.issuedAt) &&
    isString(value.number) &&
    isString(value.recipientName) &&
    isString(value.series) &&
    isOneOf(value.status, SCANNED_NFE_STATUS) &&
    isString(value.totalAmount)
  )
}

const EXPECTED_DOCUMENTS = ['blocked', 'cte', 'nfse', 'no_profile'] as const

/** Documento fora do vocabulário vira `null`: é o mesmo que "não se decidiu", e não um chute. */
function readExpectedDocument(value: unknown): TripDocumentReadiness['expectedDocument'] {
  return isOneOf(value, EXPECTED_DOCUMENTS) ? value : null
}

function toDocumentReadiness(value: unknown): TripDocumentReadiness {
  if (
    !isRecord(value) ||
    !isString(value.tripDocumentId) ||
    !isOneOf(value.reason, TRIP_DOCUMENT_READINESS_REASONS)
  ) {
    throw invalid()
  }

  return {
    cteAccessKey: isString(value.cteAccessKey) ? value.cteAccessKey : null,
    cteFiscalDocumentId: isString(value.cteFiscalDocumentId) ? value.cteFiscalDocumentId : null,
    expectedDocument: readExpectedDocument(value.expectedDocument),
    nfeDocumentId: isString(value.nfeDocumentId) ? value.nfeDocumentId : null,
    nfseProfileId: isString(value.nfseProfileId) ? value.nfseProfileId : null,
    reason: value.reason,
    rejectionCode: isString(value.rejectionCode) ? value.rejectionCode : null,
    rejectionMessage: isString(value.rejectionMessage) ? value.rejectionMessage : null,
    tripDocumentId: value.tripDocumentId,
  }
}

export function createTripResponseAdapters() {
  function tripFromApi(input: unknown): Trip {
    if (!isTrip(input)) throw invalid()
    return input
  }

  return {
    /**
     * Resposta de API é entrada não confiável (`security.md` §3), e esta decide se um botão de
     * emissão fiscal aparece: motivo fora do vocabulário tem de virar recusa, nunca `undefined`
     * atravessando até a tela dizer que está tudo pronto.
     */
    tripFiscalReadinessFromApi(input: unknown): TripFiscalReadiness {
      if (
        !isRecord(input) ||
        !Array.isArray(input.documents) ||
        typeof input.manifestableCount !== 'number' ||
        typeof input.nfseCount !== 'number' ||
        typeof input.readyCount !== 'number' ||
        typeof input.totalCount !== 'number' ||
        !isOneOf(input.state, TRIP_FISCAL_READINESS_STATES)
      ) {
        throw invalid()
      }

      return {
        documents: input.documents.map(toDocumentReadiness),
        manifestableCount: input.manifestableCount,
        nfseCount: input.nfseCount,
        readyCount: input.readyCount,
        state: input.state,
        totalCount: input.totalCount,
      }
    },
    tripMdfeRequirementFromApi(input: unknown): TripMdfeRequirement {
      if (
        !isRecord(input) ||
        typeof input.effectiveRequiresMdfe !== 'boolean' ||
        typeof input.manifestableCount !== 'number' ||
        !isNullableString(input.reason) ||
        !(input.requiresMdfe === null || typeof input.requiresMdfe === 'boolean')
      ) {
        throw invalid()
      }

      return {
        effectiveRequiresMdfe: input.effectiveRequiresMdfe,
        manifestableCount: input.manifestableCount,
        reason: input.reason,
        requiresMdfe: input.requiresMdfe,
      }
    },
    tripCteBatchResultFromApi(input: unknown): TripCteBatchResult {
      if (!isRecord(input) || !isString(input.batchId) || typeof input.documentCount !== 'number') {
        throw invalid()
      }

      return { batchId: input.batchId, documentCount: input.documentCount }
    },
    tripDetailFromApi(input: unknown): TripDetail {
      if (!isDetail(input)) throw invalid()
      return input
    },
    tripDocumentFromApi(input: unknown): TripDocument {
      if (!isDocument(input)) throw invalid()
      return input
    },
    /** Ausência é resposta, não falha: chave que a empresa não tem devolve página vazia. */
    scannedNfeDocumentFromApi(input: unknown): null | ScannedNfeDocument {
      if (!isRecord(input) || !Array.isArray(input.data)) throw invalid()
      const rows: readonly unknown[] = input.data
      const [row] = rows
      if (row === undefined) return null
      if (!isScannedDocument(row)) throw invalid()
      return {
        accessKey: row.accessKey,
        emitterName: row.emitterName,
        id: row.id,
        issuedAt: row.issuedAt,
        number: row.number,
        recipientName: row.recipientName,
        recipientAddress: readNullableColumn(row, 'recipientAddress'),
        recipientPostalCode: readNullableColumn(row, 'recipientPostalCode'),
        recipientPhone: readNullableColumn(row, 'recipientPhone'),
        cargoGrossWeight: readNullableColumn(row, 'cargoGrossWeight'),
        freightAmount: readNullableColumn(row, 'freightAmount'),
        freightRuleName: readNullableColumn(row, 'freightRuleName'),
        cargoWeightSource: readCargoWeightSource(row),
        recipientAddressNumber: readNullableColumn(row, 'recipientAddressNumber'),
        recipientLatitude: readNullableColumn(row, 'recipientLatitude'),
        recipientLongitude: readNullableColumn(row, 'recipientLongitude'),
        recipientLocationPrecision: readNullableColumn(row, 'recipientLocationPrecision'),
        recipientCity: readNullableColumn(row, 'recipientCity'),
        recipientCityCode: readNullableColumn(row, 'recipientCityCode'),
        recipientState: readNullableColumn(row, 'recipientState'),
        series: row.series,
        status: row.status,
        totalAmount: row.totalAmount,
        tripId: isString((row as Record<string, unknown>).tripId)
          ? ((row as Record<string, unknown>).tripId as string)
          : null,
      }
    },
    /**
     * A montagem por faixa lê a página inteira, não uma nota. Linha que não casa a forma esperada é
     * **descartada**, nunca derruba a página: a faixa que o operador digitou continua resolvendo com
     * o que veio bem-formado, e uma coluna nova na listagem de notas não pode travar a viagem.
     */
    /**
     * O que a tela precisa saber do lote é o que **entrou** e o que ficou de fora. A linha pulada
     * com forma estranha é descartada em vez de derrubar a resposta: a viagem já foi criada do
     * outro lado, e reprovar o corpo inteiro esconderia isso de quem acabou de vincular.
     */
    linkTripDocumentsBatchResultFromApi(input: unknown): LinkTripDocumentsBatchResult {
      if (
        !isRecord(input) ||
        !Array.isArray(input.linked) ||
        !isOneOf(input.tripStatus, TRIP_STATUS)
      )
        throw invalid()
      const skippedRows: readonly unknown[] = Array.isArray(input.skipped) ? input.skipped : []
      return {
        linked: input.linked.filter(isDocument),
        skipped: skippedRows.flatMap((row) =>
          isRecord(row) && isString(row.nfeDocumentId) && isString(row.reason)
            ? [{ nfeDocumentId: row.nfeDocumentId, reason: row.reason as 'already_linked' }]
            : [],
        ),
        tripStatus: input.tripStatus,
      }
    },
    tripCandidateDocumentPageFromApi(input: unknown): TripCandidateDocumentPage {
      if (!isRecord(input) || !Array.isArray(input.data)) throw invalid()
      const rows: readonly unknown[] = input.data
      return {
        items: rows.flatMap((row) =>
          isScannedDocument(row) && isRecord(row)
            ? [
                {
                  accessKey: row.accessKey,
                  emitterName: row.emitterName,
                  id: row.id,
                  issuedAt: row.issuedAt,
                  number: row.number,
                  recipientName: row.recipientName,
                  recipientAddress: readNullableColumn(row, 'recipientAddress'),
                  recipientPostalCode: readNullableColumn(row, 'recipientPostalCode'),
                  recipientPhone: readNullableColumn(row, 'recipientPhone'),
                  cargoGrossWeight: readNullableColumn(row, 'cargoGrossWeight'),
                  freightAmount: readNullableColumn(row, 'freightAmount'),
                  freightRuleName: readNullableColumn(row, 'freightRuleName'),
                  cargoWeightSource: readCargoWeightSource(row),
                  recipientAddressNumber: readNullableColumn(row, 'recipientAddressNumber'),
                  recipientLatitude: readNullableColumn(row, 'recipientLatitude'),
                  recipientLongitude: readNullableColumn(row, 'recipientLongitude'),
                  recipientLocationPrecision: readNullableColumn(row, 'recipientLocationPrecision'),
                  recipientCity: readNullableColumn(row, 'recipientCity'),
                  recipientCityCode: readNullableColumn(row, 'recipientCityCode'),
                  recipientState: readNullableColumn(row, 'recipientState'),
                  series: row.series,
                  status: row.status,
                  totalAmount: row.totalAmount,
                  tripId: isString((row as Record<string, unknown>).tripId)
                    ? ((row as Record<string, unknown>).tripId as string)
                    : null,
                },
              ]
            : [],
        ),
        nextCursor:
          isRecord(input.page) && isString(input.page.nextCursor) ? input.page.nextCursor : null,
      }
    },
    deliveryAddressHistoryFromApi(input: unknown): readonly DeliveryAddressOverride[] {
      if (!isRecord(input) || !isEveryItem(input.data, isDeliveryAddressOverride)) throw invalid()
      return input.data
    },
    deliveryAddressOverrideFromApi(input: unknown): DeliveryAddressOverride {
      if (!isDeliveryAddressOverride(input)) throw invalid()
      return input
    },
    batchStatusResultFromApi(input: unknown): BatchStatusResult {
      if (!isBatchStatusResult(input)) throw invalid()
      return input
    },
    cancelTripResultFromApi(input: unknown): CancelTripResult {
      if (!isTripStatusResult(input)) throw invalid()
      return { tripStatus: input.tripStatus }
    },
    dispatchTripResultFromApi(input: unknown): DispatchTripResult {
      if (!isTripStatusResult(input)) throw invalid()
      return { tripStatus: input.tripStatus }
    },
    fieldReportIdResultFromApi(input: unknown): FieldReportIdResult {
      if (!isFieldReportIdResult(input)) throw invalid()
      return { id: input.id }
    },
    reportFieldDeliveryResultFromApi(input: unknown): ReportFieldDeliveryResult {
      if (!isReportFieldDeliveryResult(input)) throw invalid()
      return {
        alreadySettled: input.alreadySettled,
        id: input.id,
        proofId: input.proofId,
        stopCompleted: input.stopCompleted,
        tripCompleted: input.tripCompleted,
      }
    },
    fieldTripStepResultFromApi(input: unknown): FieldTripStepResult {
      if (!isFieldTripStepResult(input)) throw invalid()
      return { changed: input.changed, status: input.status }
    },
    planTripRouteResultFromApi(input: unknown): PlanTripRouteResult {
      if (!isTripStatusResult(input)) throw invalid()
      return { tripStatus: input.tripStatus }
    },
    reorderTripStopsResultFromApi(input: unknown): ReorderTripStopsResult {
      if (!isRecord(input) || !isOneOf(input.tripStatus, TRIP_STATUS)) throw invalid()
      return { tripStatus: input.tripStatus }
    },
    /**
     * ⚠️ A URL vem assinada e **expira**. A validação confere que ela é string, não que ela ainda
     * vale: quem guardar o valor e reusá-lo depois mostra imagem quebrada, e é por isso que o
     * componente a consome direto da consulta.
     */
    deliveryProofsFromApi(input: unknown): readonly DeliveryProof[] {
      if (!Array.isArray(input)) throw invalid()
      /** Spec 193 T3.1: o item estranho sai sozinho — derrubar a lista apagava o comprovante todo. */
      return input.filter(isDeliveryProof)
    },
    /**
     * ⚠️ Corpo estranho vira **`unavailable`**, nunca exceção: o mapa é enfeite operacional, e uma
     * validação que estoura derrubaria a tela da viagem por causa da linha da estrada.
     */
    /**
     * ⚠️ Aqui a validação **estoura**, ao contrário do mapa: a prévia é o que responde "cabe?", e
     * desenhar um baú a partir de corpo estranho afirmaria espaço que ninguém apurou.
     */
    tripCargoPreviewFromApi(input: unknown): TripCargoPreview {
      if (!isRecord(input)) throw invalid()
      const { cargoLayout, cargoWeight, layoutId, occupancy, state, weightConcentration } = input
      /** ⚠️ Spec 145 D17: a prévia não confere chaves, então só a forma de `layoutId`/`state` reprova. */
      if (layoutId !== undefined && !isString(layoutId)) throw invalid()
      if (state !== undefined && !isCargoLayoutState(state)) throw invalid()
      const layoutOk =
        cargoLayout === null || cargoLayout === undefined || isCargoLayout(cargoLayout)
      const weightOk =
        cargoWeight === null || cargoWeight === undefined || isCargoWeight(cargoWeight)
      const occupancyOk = occupancy === null || occupancy === undefined || isOccupancy(occupancy)
      const concentrationOk =
        weightConcentration === null ||
        weightConcentration === undefined ||
        isWeightConcentration(weightConcentration)
      if (!layoutOk || !weightOk || !occupancyOk || !concentrationOk) throw invalid()
      return {
        cargoLayout: (cargoLayout ?? null) as TripCargoLayout | null,
        cargoWeight: (cargoWeight ?? null) as TripCargoWeight | null,
        occupancy: (occupancy ?? null) as TripOccupancy | null,
        weightConcentration: weightConcentration ?? null,
        ...(layoutId === undefined ? {} : { layoutId }),
        ...(state === undefined ? {} : { state }),
      }
    },
    /** Spec 145 T11: chave exata, `state` e planta pelos mesmos validadores da prévia. */
    tripCargoLayoutPollFromApi(input: unknown): TripCargoLayoutPoll {
      if (!hasExactKeys(input, TRIP_CARGO_LAYOUT_POLL_KEYS)) throw invalid()
      const { cargoLayout, layoutId, state } = input
      if (!isString(layoutId) || !isCargoLayoutState(state)) throw invalid()
      if (cargoLayout !== null && !isCargoLayout(cargoLayout)) throw invalid()
      return { cargoLayout: cargoLayout as TripCargoLayout | null, layoutId, state }
    },
    routeGeometryFromApi(input: unknown): RouteGeometry {
      if (!isRecord(input) || !isOneOf(input.source, ROUTE_GEOMETRY_SOURCES)) {
        return UNAVAILABLE_ROUTE_GEOMETRY
      }
      const points = Array.isArray(input.points) ? input.points : []
      if (!points.every(isGeometryPoint)) {
        return UNAVAILABLE_ROUTE_GEOMETRY
      }
      /**
       * ⚠️ Trecho estranho zera **só os trechos**, não a linha: a estrada continua desenhável, e o
       * que se perde é o tempo — que some da tela em vez de virar palpite. Devolver `unavailable`
       * aqui apagaria um desenho bom por causa de um número ruim.
       */
      const legs = Array.isArray(input.legs) ? input.legs : []
      /**
       * ⚠️ Pedágio estranho zera **só o pedágio**, pelo mesmo motivo do trecho: a linha e o tempo
       * continuam valendo, e é melhor a tela dizer "não calculei" do que esconder o mapa inteiro.
       */
      /**
       * Spec 096 T1: as alternativas, mais o ranking de `rankRouteOptions` (T2). Opção estranha
       * zera **só as opções** — a linha, o tempo e o pedágio da principal continuam valendo, e a
       * tela simplesmente deixa de oferecer seletor (o mesmo comportamento de rota única, D2).
       */
      const rawOptions: readonly unknown[] = Array.isArray(input.options) ? input.options : []
      const options = rawOptions.every(isGeometryOption) ? rawOptions.map(toGeometryOption) : []
      return {
        cheapestIndex: isNullableNumber(input.cheapestIndex) ? input.cheapestIndex : null,
        choiceReproduced: input.choiceReproduced !== false,
        criterion: isOneOf(input.criterion, ROUTE_CHOICE_CRITERIA) ? input.criterion : null,
        depot: isGeometryDepot(input.depot) ? input.depot : null,
        costGap: isOneOf(input.costGap, ROUTE_COST_GAPS) ? input.costGap : null,
        fastestIndex: isNullableNumber(input.fastestIndex) ? input.fastestIndex : null,
        frozen: input.frozen === true,
        hasChoice: input.hasChoice === true,
        legs: legs.every(isGeometryLeg) ? legs : [],
        options,
        points,
        selectedIndex: readOptionIndex({ index: input.selectedIndex, optionCount: options.length }),
        source: input.source,
        toll: isGeometryToll(input.toll) ? input.toll : null,
      }
    },
    occurrenceTypesFromApi(input: unknown): readonly OccurrenceType[] {
      if (!Array.isArray(input) || !input.every(isOccurrenceType)) throw invalid()
      return input.map(toOccurrenceType)
    },
    occurrenceTypeFromApi(input: unknown): OccurrenceType {
      if (!isOccurrenceType(input)) throw invalid()
      return toOccurrenceType(input)
    },
    occurrencesFromApi(input: unknown): readonly TripOccurrence[] {
      if (!Array.isArray(input) || !input.every(isTripOccurrence)) throw invalid()
      return input
    },
    /** Spec 158 T7: `GET /trips/:id/timeline` — `{ items, nextCursor }` direto sob `data`. */
    tripTimelineFromApi(input: unknown): TripTimelinePage {
      if (
        !isRecord(input) ||
        !Array.isArray(input.items) ||
        !input.items.every(isTimelineItem) ||
        !isNullableString(input.nextCursor)
      ) {
        throw invalid()
      }
      return { items: input.items, nextCursor: input.nextCursor }
    },
    /** Spec 156 T9: `GET /trips/occurrence-types/field` — o catálogo do lote de ocorrência. */
    fieldOccurrenceTypesFromApi(input: unknown): readonly FieldOccurrenceType[] {
      if (!Array.isArray(input) || !input.every(isFieldOccurrenceType)) throw invalid()
      return input
    },
    /** Spec 156 T7.3/T9: `POST .../field-occurrences` — na ordem do pedido, nunca `null`. */
    fieldOccurrenceBatchResultFromApi(
      input: unknown,
    ): readonly Readonly<{ documentId: string; id: string }>[] {
      if (!isRecord(input) || !Array.isArray(input.items)) throw invalid()
      if (
        !input.items.every(
          (item): item is Readonly<{ documentId: string; id: string }> =>
            hasExactKeys(item, ['documentId', 'id']) &&
            isString(item.documentId) &&
            isString(item.id),
        )
      ) {
        throw invalid()
      }
      return input.items
    },
    /**
     * ⚠️ O registro devolve **mais** que a listagem: o e-mail pronto vem junto. O guard aceita a
     * chave a mais em vez de reusar `isOccurrence`, que é exato de propósito.
     */
    registeredOccurrenceFromApi(input: unknown): RegisteredOccurrence {
      if (!isRecord(input)) throw invalid()
      const { attachments, autoDispatch, email, ...occurrence } = input
      if (!isTripOccurrence(occurrence)) throw invalid()
      if (
        attachments !== undefined &&
        !(Array.isArray(attachments) && attachments.every(isOccurrenceAttachmentPosition))
      ) {
        throw invalid()
      }
      if (email !== null && !(isRecord(email) && isString(email.body) && isString(email.subject))) {
        throw invalid()
      }
      /** Spec 185 T6.1 (RF2/RF3): a ocorrência de separação também tenta o despacho automático. */
      if (autoDispatch !== undefined && !isAutoDispatchOutcome(autoDispatch)) throw invalid()
      return {
        ...occurrence,
        attachments: attachments ?? [],
        ...(autoDispatch === undefined ? {} : { autoDispatch }),
        email: email as RegisteredOccurrence['email'],
      }
    },
    /** Spec 161 T7/T22: `POST .../occurrences/:occurrenceId/attachments` — `{ id, position }`. */
    occurrenceAttachmentPositionFromApi(
      input: unknown,
    ): Readonly<{ id: string; position: number }> {
      if (!isOccurrenceAttachmentPosition(input)) throw invalid()
      return input
    },
    documentProductsFromApi(input: unknown): readonly TripDocumentProduct[] {
      if (!Array.isArray(input) || !input.every(isDocumentProduct)) throw invalid()
      return input
    },
    transitionTripDocumentResultFromApi(input: unknown): TransitionTripDocumentResult {
      if (!isTransitionResult(input)) throw invalid()
      return input
    },
    tripFromApi,
    tripListFromApi(input: unknown): TripPage {
      if (!isRecord(input) || !Array.isArray(input.data) || !isRecord(input.page)) throw invalid()
      const nextCursor = input.page.nextCursor
      if (!isNullableString(nextCursor)) throw invalid()
      return { items: input.data.map(tripFromApi), nextCursor }
    },
  }
}

/**
 * ⚠️ O detalhe da viagem **não valida** `cargoLayout` — ele passa direto, lacuna da spec 076. A
 * prévia valida, porque ela desenha a partir do que chega e um `rows` estranho viraria um baú com
 * fileiras sem dono em vez de um erro.
 */
function isCargoLayout(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    Array.isArray(value.rows) &&
    value.rows.every(
      (row) =>
        isRecord(row) &&
        isString(row.label) &&
        isUnsignedInteger(row.loadOrder) &&
        isUnsignedInteger(row.sequence) &&
        typeof row.sideReachable === 'boolean',
    ) &&
    isUnsignedInteger(value.freeRows) &&
    typeof value.orderIsBinding === 'boolean' &&
    /**
     * ⚠️ Tolerante à **ausência**, não ao lixo (spec 100): a API sobe antes do frontend, e recusar o
     * corpo por falta do campo apagaria o painel de carga inteiro na janela entre os dois deploys.
     */
    (value.stopArrangement === undefined ||
      value.stopArrangement === 'depth' ||
      value.stopArrangement === 'grid' ||
      value.stopArrangement === 'lanes') &&
    (value.stopArrangementReason === undefined ||
      typeof value.stopArrangementReason === 'string') &&
    (value.layoutNotes === undefined ||
      (Array.isArray(value.layoutNotes) &&
        value.layoutNotes.every((note) => typeof note === 'string'))) &&
    typeof value.occupancyKnown === 'boolean' &&
    isString(value.overflowM3) &&
    /**
     * Spec 088: os quatro andam juntos — ou o baú tem medida e a planta existe, ou nenhum deles vem.
     * Um só preenchido seria uma planta com metade da escala, desenhada mesmo assim.
     */
    isNullableString(value.bedLengthM) &&
    isNullableString(value.bedSource) &&
    /** API antiga não serve o acesso: sem ele a planta desenha só a traseira, que é o mais restritivo. */
    (value.loadingAccess === undefined || isString(value.loadingAccess)) &&
    /**
     * Spec 096: o arranjo é opcional na resposta — API antiga não o serve, e recusar a resposta
     * inteira por causa dele apagaria a planta que já funciona.
     */
    (value.placement === undefined || value.placement === null || isPlacement(value.placement)) &&
    isNullableString(value.bedWidthM) &&
    isNullableString(value.freeDepthM) &&
    isNullableString(value.overflowDepthM) &&
    Array.isArray(value.stopsWithoutVolume) &&
    /**
     * Spec 144 (D4): a lista do que falta medir é opcional — API antiga não a serve, e recusar a
     * resposta inteira por causa dela apagaria a planta que já funciona.
     */
    (value.pendingMeasurements === undefined ||
      (Array.isArray(value.pendingMeasurements) &&
        value.pendingMeasurements.every(isPendingMeasurement)))
  )
}

const CARGO_ESTIMATE_SOURCES = ['median', 'none', 'note'] as const

/** Spec 144 (D4): uma linha da lista do que falta medir. */
function isPendingMeasurement(value: unknown): value is TripPendingMeasurement {
  return (
    isRecord(value) &&
    isUnsignedInteger(value.boxCount) &&
    isNullableString(value.documentNumber) &&
    isOneOf(value.estimateSource, CARGO_ESTIMATE_SOURCES) &&
    isNullableNumber(value.grossWeightGrams) &&
    isNullableString(value.label) &&
    isNullableString(value.packageBoxId) &&
    isNullableString(value.productCode) &&
    isUnsignedInteger(value.sequence) &&
    isString(value.stopLabel) &&
    isNullableNumber(value.unitsPerBox)
  )
}

/**
 * O arranjo camada por camada. Valida a forma, não cada caixa: são até 600, e percorrer todas em
 * cada resposta custaria mais que desenhá-las.
 */
function isPlacement(value: unknown): boolean {
  if (!isRecord(value)) return false

  return (
    Array.isArray(value.layers) &&
    value.layers.every(
      (layer) => isRecord(layer) && Array.isArray(layer.boxes) && isUnsignedInteger(layer.index),
    ) &&
    Array.isArray(value.unplaced) &&
    isOneOf(value.source, TRIP_OCCUPANCY_SOURCES)
  )
}

/** Spec 075: ausência é `null`, e a tela lê isso como "não dá para dizer" — nunca como zero. */
function isCargoWeight(value: unknown): boolean {
  if (!hasExactKeys(value, TRIP_CARGO_WEIGHT_KEYS)) return false
  return (
    isUnsignedInteger(value.documentsWithoutWeight) &&
    isString(value.grossWeightKilograms) &&
    /** Os dois andam juntos: teto sem percentual, ou percentual sem teto, é resposta pela metade. */
    isNullableString(value.maxPayloadKg) &&
    isNullableString(value.payloadRatio) &&
    isOneOf(value.source, TRIP_OCCUPANCY_SOURCES)
  )
}

/**
 * ⚠️ As quatro origens do total. Origem que esta lista não conhece é **recusa**, não número sem
 * marca: a marca é o que separa "cabe" de "deve caber", e a tela é proibida de imprimir o
 * percentual sozinho.
 */
const TRIP_OCCUPANCY_SOURCES = ['declared', 'estimated', 'measured', 'partial'] as const

function isWeightConcentration(value: unknown): value is TripWeightConcentration {
  return (
    isRecord(value) &&
    isString(value.label) &&
    typeof value.share === 'number' &&
    isString(value.stopId)
  )
}

function isOccupancy(value: unknown): boolean {
  if (!hasExactKeys(value, TRIP_OCCUPANCY_KEYS)) return false
  return (
    isString(value.capacityM3) &&
    isString(value.capacitySource) &&
    isUnsignedInteger(value.documentsWithoutVolume) &&
    isString(value.loadedM3) &&
    isString(value.occupancyRatio) &&
    isOneOf(value.source, TRIP_OCCUPANCY_SOURCES)
  )
}

/** Spec 193 T3.1: quem recebeu entra por `hasKeys`, e chave desconhecida continua recusada. */
function isDeliveryProof(value: unknown): value is DeliveryProof {
  if (
    !hasKeys(value, {
      allowed: [...DELIVERY_PROOF_KEYS, ...DELIVERY_PROOF_RECEIVED_BY_KEYS],
      required: DELIVERY_PROOF_KEYS,
    })
  ) {
    return false
  }
  return (
    isString(value.createdAt) &&
    isString(value.downloadUrl) &&
    isString(value.expiresAt) &&
    isString(value.id) &&
    (value.kind === 'photo' || value.kind === 'signature' || value.kind === 'cargo') &&
    (value.receivedBy === undefined ||
      value.receivedBy === null ||
      isOneOf(value.receivedBy, DELIVERY_PROOF_RECEIVED_BY_OPTIONS)) &&
    (value.receivedByDetail === undefined || isNullableString(value.receivedByDetail)) &&
    isString(value.receiverName)
  )
}

function isDocumentProduct(value: unknown): value is TripDocumentProduct {
  if (!hasExactKeys(value, TRIP_DOCUMENT_PRODUCT_KEYS)) return false
  return (
    isString(value.code) &&
    isString(value.commercialUnit) &&
    isString(value.description) &&
    isUnsignedInteger(value.ordinal) &&
    isString(value.quantity) &&
    isString(value.totalValue) &&
    isString(value.unitValue)
  )
}

/** Exportada para o contrato: a guarda é de chave exata, e campo novo é mudança de contrato. */
/**
 * Spec 166 RF1/RF6. Spec 172 RF1: a unidade deixou de ser fechada em `unit`/`box` — passa a
 * aceitar também a unidade comercial da nota (`KG`, `L`, `CX`...), string livre validada pela API,
 * não por uma lista fixa aqui. Item torto continua recusando a resposta, como qualquer outra forma
 * inesperada — só o valor de `unit` deixou de ser enumerado.
 */
function isOccurrenceProduct(value: unknown): value is OccurrenceProduct {
  return (
    hasExactKeys(value, ['code', 'quantity', 'unit'] as const) &&
    isString(value.code) &&
    (value.quantity === null || isString(value.quantity)) &&
    (value.unit === null || isString(value.unit)) &&
    /** Os dois andam juntos, como no banco — meia contagem não chega à tela. */
    (value.quantity === null) === (value.unit === null)
  )
}

/**
 * Spec 167 RF9: a correção sem o conjunto anterior chegaria à tela como histórico vazio — pior que
 * histórico ausente, porque parece que ninguém mexeu na ocorrência.
 */
function isOccurrenceCorrection(value: unknown): value is OccurrenceCorrection {
  return (
    hasExactKeys(value, ['correctedAt', 'correctedByName', 'previousItems'] as const) &&
    isString(value.correctedAt) &&
    isString(value.correctedByName) &&
    isEveryItem(value.previousItems, isOccurrenceProduct)
  )
}

/** O motivo é o que justifica o cancelamento: cancelamento sem ele não chega à tela. */
function isOccurrenceCancellation(value: unknown): value is OccurrenceCancellation {
  return (
    hasExactKeys(value, ['cancelledAt', 'cancelledByName', 'reason'] as const) &&
    isString(value.cancelledAt) &&
    isString(value.cancelledByName) &&
    isString(value.reason)
  )
}

export function isTripOccurrence(value: unknown): value is TripOccurrence {
  if (
    !hasKeys(value, {
      allowed: [...TRIP_OCCURRENCE_KEYS, ...TRIP_OCCURRENCE_OPTIONAL_KEYS],
      required: TRIP_OCCURRENCE_KEYS,
    })
  ) {
    return false
  }
  return (
    (value.actorName === undefined || isNullableString(value.actorName)) &&
    (value.attachments === undefined ||
      (Array.isArray(value.attachments) && value.attachments.every(isOccurrenceAttachment))) &&
    (value.channel === undefined || isOneOf(value.channel, TRIP_FIELD_CHANNELS)) &&
    isString(value.createdAt) &&
    isString(value.id) &&
    isString(value.note) &&
    (value.onBehalfOfDriverName === undefined || isNullableString(value.onBehalfOfDriverName)) &&
    isString(value.occurrenceTypeId) &&
    isString(value.productCode) &&
    (value.productCodes === undefined || isEveryItem(value.productCodes, isString)) &&
    (value.products === undefined || isEveryItem(value.products, isOccurrenceProduct)) &&
    (value.corrections === undefined || isEveryItem(value.corrections, isOccurrenceCorrection)) &&
    (value.cancellation === undefined ||
      value.cancellation === null ||
      isOccurrenceCancellation(value.cancellation)) &&
    (value.stage === 'delivery' || value.stage === 'separation') &&
    isString(value.typeName)
  )
}

/** Spec 161 T6/T22: `{ id, position }` de uma foto gravada — sem URL (D5), resposta estreita da
 * rota de anexo (RF6), diferente do formato completo de leitura (RF8, `isOccurrenceAttachment`). */
function isOccurrenceAttachmentPosition(
  value: unknown,
): value is Readonly<{ id: string; position: number }> {
  return (
    hasExactKeys(value, ['id', 'position'] as const) &&
    isString(value.id) &&
    typeof value.position === 'number'
  )
}

/**
 * Spec 179 T304: `attachmentMode` é aditivo (`hasKeys`, não `hasExactKeys`) — API mais nova que o
 * bundle manda o campo, API mais velha não manda, e as duas passam.
 */
function isFieldOccurrenceType(value: unknown): value is FieldOccurrenceType {
  return (
    hasKeys(value, {
      allowed: [...FIELD_OCCURRENCE_TYPE_KEYS, ...FIELD_OCCURRENCE_TYPE_OPTIONAL_KEYS],
      required: FIELD_OCCURRENCE_TYPE_KEYS,
    }) &&
    isString(value.id) &&
    isString(value.name) &&
    (value.attachmentMode === undefined ||
      isOneOf(value.attachmentMode, OCCURRENCE_ATTACHMENT_MODES))
  )
}

function isTimelineStopReference(value: unknown): value is TripTimelineStopReference {
  return (
    hasExactKeys(value, TRIP_TIMELINE_STOP_REFERENCE_KEYS) &&
    isString(value.id) &&
    isUnsignedInteger(value.sequence)
  )
}

function isTimelineDocumentReference(value: unknown): value is TripTimelineDocumentReference {
  return (
    hasExactKeys(value, TRIP_TIMELINE_DOCUMENT_REFERENCE_KEYS) &&
    isString(value.id) &&
    isNullableString(value.number) &&
    isNullableString(value.series)
  )
}

function isTimelineOccurrenceReference(value: unknown): value is TripTimelineOccurrenceReference {
  if (
    !hasKeys(value, {
      allowed: [
        ...TRIP_TIMELINE_OCCURRENCE_REFERENCE_KEYS,
        ...TRIP_TIMELINE_OCCURRENCE_REFERENCE_OPTIONAL_KEYS,
      ],
      required: TRIP_TIMELINE_OCCURRENCE_REFERENCE_KEYS,
    })
  ) {
    return false
  }
  return (
    isString(value.note) &&
    isString(value.typeName) &&
    (value.attachmentCount === undefined || isUnsignedInteger(value.attachmentCount))
  )
}

/**
 * Spec 158 D6/aceite 8: chave desconhecida, `channel`/`kind` fora do vocabulário são recusados —
 * `actorUserId`, `receiverName`, `receiverDocumentMasked`, `latitude`, `longitude`, `objectKey`
 * nunca fazem parte de `TRIP_TIMELINE_ITEM_KEYS`, então uma chave a mais já reprova por si.
 */
function isTimelineItem(value: unknown): value is TripTimelineItem {
  if (!hasExactKeys(value, TRIP_TIMELINE_ITEM_KEYS)) return false
  return (
    isNullableString(value.actorName) &&
    (value.channel === null || isOneOf(value.channel, TRIP_FIELD_CHANNELS)) &&
    isNullableString(value.closeReason) &&
    (value.document === null || isTimelineDocumentReference(value.document)) &&
    isNullableString(value.fromStatus) &&
    isString(value.id) &&
    isOneOf(value.kind, TRIP_TIMELINE_KINDS) &&
    (value.occurrence === null || isTimelineOccurrenceReference(value.occurrence)) &&
    isString(value.occurredAt) &&
    isNullableString(value.onBehalfOfDriverName) &&
    isNullableString(value.recordedAt) &&
    isNullableString(value.returnReason) &&
    (value.stop === null || isTimelineStopReference(value.stop)) &&
    isNullableString(value.toStatus)
  )
}

function isGeometryPoint(
  value: unknown,
): value is Readonly<{ latitude: string; longitude: string }> {
  return isRecord(value) && isString(value.latitude) && isString(value.longitude)
}

/**
 * ⚠️ Número **finito**, não só `number`: `NaN` e infinito atravessam `typeof` e vão parar numa soma
 * que devolve tempo de roteiro sem valor nenhum.
 */
function isGeometryLeg(value: unknown): value is RouteGeometryLeg {
  return (
    isRecord(value) &&
    typeof value.distanceMetres === 'number' &&
    Number.isFinite(value.distanceMetres) &&
    typeof value.durationSeconds === 'number' &&
    Number.isFinite(value.durationSeconds)
  )
}

function isGeometryTollBooth(value: unknown): value is RouteGeometryTollBooth {
  return (
    isRecord(value) &&
    isNullableString(value.chargeCar) &&
    isNullableString(value.chargePerAxle) &&
    isNullableString(value.effectiveChargePerAxle) &&
    typeof value.fellBackToManual === 'boolean' &&
    isNullableString(value.total) &&
    isString(value.latitude) &&
    isString(value.longitude) &&
    isNullableString(value.name) &&
    isNullableString(value.operator) &&
    typeof value.osmNodeId === 'number' &&
    Number.isFinite(value.osmNodeId) &&
    /**
     * ⚠️ Tolerante à **ausência**, não ao lixo: API antiga não manda o campo, e recusar a praça
     * inteira por causa dele apagaria o pedágio da tela durante a janela entre subir a API e subir
     * o frontend. Presente, tem de ser inteiro.
     */
    (value.legIndex === undefined ||
      value.legIndex === null ||
      (typeof value.legIndex === 'number' && Number.isInteger(value.legIndex)))
  )
}

/**
 * Se o catálogo de praças está carregado e em dia — `empty` não pode virar "sem pedágio na rota"
 * (ver `TollCatalogView`).
 */
function isGeometryTollCatalog(value: unknown): value is TollCatalogView {
  return (
    isRecord(value) &&
    isNullableString(value.observedOn) &&
    isOneOf(value.status, TOLL_CATALOG_STATUSES)
  )
}

/** Spec 090 T7: o pedágio vem na resposta da geometria — validado com o mesmo rigor de qualquer dado. */
function isGeometryToll(value: unknown): value is RouteGeometryToll {
  if (!isRecord(value)) return false
  const {
    axles,
    booths,
    boothsFallenBackToManual,
    boothsWithoutCharge,
    catalog,
    chargePerAxle,
    paymentMode,
    tariffObservedOn,
    total,
  } = value
  return (
    isRecord(axles) &&
    typeof axles.count === 'number' &&
    isOneOf(axles.source, AXLE_COUNT_SOURCES) &&
    Array.isArray(booths) &&
    booths.every(isGeometryTollBooth) &&
    typeof boothsFallenBackToManual === 'number' &&
    typeof boothsWithoutCharge === 'number' &&
    isGeometryTollCatalog(catalog) &&
    isString(value.multiplierLabel) &&
    isString(chargePerAxle) &&
    isOneOf(paymentMode, TOLL_PAYMENT_MODES) &&
    isNullableString(tariffObservedOn) &&
    isString(total)
  )
}

/** Spec 096 T1: a alternativa de rota, com a mesma forma que a geometria — mais o custo total. */
/** ⚠️ Índice fora da lista é ausência: a tela cai na principal em vez de ler `undefined`. */
function readOptionIndex(input: {
  readonly index: unknown
  readonly optionCount: number
}): null | number {
  const { index, optionCount } = input
  if (typeof index !== 'number' || !Number.isInteger(index)) return null
  return index >= 0 && index < optionCount ? index : null
}

type RawGeometryOption = Omit<RouteGeometryOption, 'isNoToll' | 'signature'> &
  Readonly<{ isNoToll?: unknown; signature?: unknown }>

/**
 * A assinatura e a marca de sem pedágio são lidas à parte: resposta anterior à spec 153 não as
 * traz, e isso não invalida a opção — só deixa a rota sem identidade para reproduzir (`null`).
 */
function toGeometryOption(option: RawGeometryOption): RouteGeometryOption {
  const { isNoToll, signature, ...rest } = option
  return { ...rest, isNoToll: isNoToll === true, signature: isString(signature) ? signature : null }
}

function isGeometryOption(value: unknown): value is RawGeometryOption {
  if (!isRecord(value)) return false
  const { distanceMeters, durationSeconds, fuelTotal, legs, points, toll, totalCost } = value
  return (
    typeof distanceMeters === 'number' &&
    Number.isFinite(distanceMeters) &&
    typeof durationSeconds === 'number' &&
    Number.isFinite(durationSeconds) &&
    isNullableString(fuelTotal) &&
    Array.isArray(legs) &&
    legs.every(isGeometryLeg) &&
    Array.isArray(points) &&
    points.every(isGeometryPoint) &&
    (toll === null || isGeometryToll(toll)) &&
    isNullableString(totalCost)
  )
}

function isNullableNumber(value: unknown): value is null | number {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

const OCCURRENCE_TYPE_REQUIRED_KEYS = [
  'active',
  'emailBody',
  'emailSubject',
  'emailTemplateKey',
  'id',
  'name',
  'notifies',
  'stage',
] as const

/**
 * Spec 166/164: `allowsMultipleItems` e `redeliveryPolicy` nasceram depois do tipo — API anterior
 * ao marcador não os manda. Exigi-los em `hasExactKeys` derrubaria o catálogo inteiro e a consulta
 * de tipos que alimenta o diálogo de registro (achado B7 da revisão). Ausente degrada para o
 * padrão de hoje, em `toOccurrenceType`; presente continua validado como antes.
 */
type RawOccurrenceType = Omit<
  OccurrenceType,
  'allowsMultipleItems' | 'attachmentMode' | 'leavesDocumentBehind' | 'redeliveryPolicy'
> &
  Readonly<{
    allowsMultipleItems?: unknown
    attachmentMode?: unknown
    leavesDocumentBehind?: unknown
    redeliveryPolicy?: unknown
  }>

function isOccurrenceType(value: unknown): value is RawOccurrenceType {
  if (
    !hasKeys(value, {
      /**
       * Spec 179: `attachmentMode` sai da API (`/company-settings/occurrence-types`) e o editor o
       * consome (T401). Ausente é API anterior ao campo e vira `off` em `toOccurrenceType`;
       * presente, só o vocabulário do comprovante passa.
       */
      allowed: [
        ...OCCURRENCE_TYPE_REQUIRED_KEYS,
        'allowsMultipleItems',
        'attachmentMode',
        /** Spec 185 T6.1 (D2): mesma tolerância — ausente é API anterior ao campo. */
        'leavesDocumentBehind',
        'redeliveryPolicy',
      ],
      required: OCCURRENCE_TYPE_REQUIRED_KEYS,
    })
  ) {
    return false
  }
  return (
    isBoolean(value.active) &&
    (value.allowsMultipleItems === undefined || isBoolean(value.allowsMultipleItems)) &&
    (value.attachmentMode === undefined ||
      isOneOf(value.attachmentMode, OCCURRENCE_ATTACHMENT_MODES)) &&
    isString(value.emailBody) &&
    isString(value.emailSubject) &&
    (value.emailTemplateKey === null || isString(value.emailTemplateKey)) &&
    isString(value.id) &&
    (value.leavesDocumentBehind === undefined || isBoolean(value.leavesDocumentBehind)) &&
    isString(value.name) &&
    isBoolean(value.notifies) &&
    (value.redeliveryPolicy === undefined ||
      value.redeliveryPolicy === 'unset' ||
      value.redeliveryPolicy === 'allowed' ||
      value.redeliveryPolicy === 'blocked') &&
    (value.stage === 'delivery' || value.stage === 'separation')
  )
}

/** Achado B7: `allowsMultipleItems` nasce `true` (comportamento de hoje) e `redeliveryPolicy`
 * nasce `unset` (D1/RF1) — os mesmos padrões documentados em `occurrence.constant.ts`.
 * `leavesDocumentBehind` nasce `false` (spec 185 T6.1 D2), o mesmo padrão do banco. */
function toOccurrenceType(raw: RawOccurrenceType): OccurrenceType {
  const { allowsMultipleItems, attachmentMode, leavesDocumentBehind, redeliveryPolicy, ...rest } =
    raw
  return {
    ...rest,
    allowsMultipleItems: isBoolean(allowsMultipleItems) ? allowsMultipleItems : true,
    attachmentMode: isOneOf(attachmentMode, OCCURRENCE_ATTACHMENT_MODES) ? attachmentMode : 'off',
    leavesDocumentBehind: isBoolean(leavesDocumentBehind) ? leavesDocumentBehind : false,
    redeliveryPolicy:
      redeliveryPolicy === 'allowed' ||
      redeliveryPolicy === 'blocked' ||
      redeliveryPolicy === 'unset'
        ? redeliveryPolicy
        : 'unset',
  }
}
