/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeliveryProof } from './deliveryProof.service'
import type { OccurrenceType } from './occurrence.constant'
import type { RegisteredOccurrence, TripDocumentProduct, TripOccurrence } from './trip.types'
import {
  ROUTE_GEOMETRY_SOURCES,
  type RouteGeometry,
  type RouteGeometryLeg,
} from './routeGeometry.service'
import {
  BATCH_STATUS_RESULT_KEYS,
  DELIVERY_ADDRESS_OVERRIDE_KEYS,
  STOP_ADDRESS_COMPONENTS_KEYS,
  TRANSITION_RESULT_KEYS,
  TRIP_DETAIL_KEYS,
  TRIP_DETAIL_OPTIONAL_KEYS,
  DELIVERY_PROOF_KEYS,
  TRIP_DOCUMENT_PRODUCT_KEYS,
  TRIP_OCCURRENCE_KEYS,
  TRIP_CARGO_WEIGHT_KEYS,
  TRIP_OCCUPANCY_KEYS,
  TRIP_DOCUMENT_DETAIL_KEYS,
  TRIP_DOCUMENT_DETAIL_OPTIONAL_KEYS,
  TRIP_DOCUMENT_KEYS,
  TRIP_DRIVER_KEYS,
  TRIP_DRIVER_OPTIONAL_KEYS,
  TRIP_ERROR,
  TRIP_KEYS,
  TRIP_STATUS_RESULT_KEYS,
  TRIP_STOP_KEYS,
  TRIP_STOP_OPTIONAL_KEYS,
} from './trip.constant'
import {
  SCANNED_NFE_STATUS,
  TRIP_BATCH_ITEM_OUTCOME,
  TRIP_DOCUMENT_READINESS_REASONS,
  TRIP_FISCAL_READINESS_STATES,
  TRIP_DESTINATION_ORIGINS,
  TRIP_DOCUMENT_SEPARATION_STATUS,
  TRIP_STATUS,
} from './trip.types'
import type {
  BatchStatusResult,
  CancelTripResult,
  DeliveryAddressOverride,
  DispatchTripResult,
  PlanTripRouteResult,
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
  isOneOf,
  isRecord,
  isString,
  isUnsignedInteger,
} from './tripGuards.validation'

/**
 * Coluna que a listagem de notas pode não ter mandado: ausente é ausência, não resposta inválida —
 * a guarda de forma desta linha é parcial de propósito (ver `isScannedDocument`).
 */
function readNullableColumn(row: unknown, column: string): null | string {
  if (!isRecord(row)) return null
  const value = row[column]
  return isString(value) ? value : null
}

function invalid(): Error {
  return new Error(TRIP_ERROR.RESPONSE_INVALID)
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
  if (!hasExactKeys(value, TRIP_KEYS)) return false
  return isTripFields(value)
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
    isString(value.driverTaxId) &&
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
  return isDocumentFields(value) && isBoolean(value.cteAuthorized) && isString(value.fiscalStatus)
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
    isUnsignedInteger(value.sequence)
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
    isEveryItem(value.documents, isDocumentDetail) &&
    isEveryItem(value.drivers, isDriverLine) &&
    /** Opcional não é "qualquer coisa": presente com forma errada continua reprovando (D2). */
    (value.cargoWeight === undefined ||
      value.cargoWeight === null ||
      isCargoWeight(value.cargoWeight)) &&
    (value.occupancy === undefined || value.occupancy === null || isOccupancy(value.occupancy)) &&
    isEveryItem(value.stops, isStopDetail)
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

function isTransitionResult(value: unknown): value is TransitionTripDocumentResult {
  if (!hasExactKeys(value, TRANSITION_RESULT_KEYS)) return false
  return isDocument(value.document) && isOneOf(value.tripStatus, TRIP_STATUS)
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
  if (!hasExactKeys(value, BATCH_STATUS_RESULT_KEYS)) return false
  return isEveryItem(value.items, isBatchItemResult) && isOneOf(value.tripStatus, TRIP_STATUS)
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

/** Documento fora do par conhecido vira `null`: é o mesmo que "não se decidiu", e não um chute. */
function readExpectedDocument(value: unknown): 'cte' | 'nfse' | null {
  return value === 'cte' || value === 'nfse' ? value : null
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
      if (!Array.isArray(input) || !input.every(isDeliveryProof)) throw invalid()
      return input
    },
    /**
     * ⚠️ Corpo estranho vira **`unavailable`**, nunca exceção: o mapa é enfeite operacional, e uma
     * validação que estoura derrubaria a tela da viagem por causa da linha da estrada.
     */
    routeGeometryFromApi(input: unknown): RouteGeometry {
      if (!isRecord(input) || !isOneOf(input.source, ROUTE_GEOMETRY_SOURCES)) {
        return { legs: [], points: [], source: 'unavailable' }
      }
      const points = Array.isArray(input.points) ? input.points : []
      if (!points.every(isGeometryPoint)) return { legs: [], points: [], source: 'unavailable' }
      /**
       * ⚠️ Trecho estranho zera **só os trechos**, não a linha: a estrada continua desenhável, e o
       * que se perde é o tempo — que some da tela em vez de virar palpite. Devolver `unavailable`
       * aqui apagaria um desenho bom por causa de um número ruim.
       */
      const legs = Array.isArray(input.legs) ? input.legs : []
      return { legs: legs.every(isGeometryLeg) ? legs : [], points, source: input.source }
    },
    occurrenceTypesFromApi(input: unknown): readonly OccurrenceType[] {
      if (!Array.isArray(input) || !input.every(isOccurrenceType)) throw invalid()
      return input
    },
    occurrenceTypeFromApi(input: unknown): OccurrenceType {
      if (!isOccurrenceType(input)) throw invalid()
      return input
    },
    occurrencesFromApi(input: unknown): readonly TripOccurrence[] {
      if (!Array.isArray(input) || !input.every(isOccurrence)) throw invalid()
      return input
    },
    /**
     * ⚠️ O registro devolve **mais** que a listagem: o e-mail pronto vem junto. O guard aceita a
     * chave a mais em vez de reusar `isOccurrence`, que é exato de propósito.
     */
    registeredOccurrenceFromApi(input: unknown): RegisteredOccurrence {
      if (!isRecord(input)) throw invalid()
      const { email, ...occurrence } = input
      if (!isOccurrence(occurrence)) throw invalid()
      if (email !== null && !(isRecord(email) && isString(email.body) && isString(email.subject))) {
        throw invalid()
      }
      return { ...occurrence, email: email as RegisteredOccurrence['email'] }
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

/** Spec 075: ausência é `null`, e a tela lê isso como "não dá para dizer" — nunca como zero. */
function isCargoWeight(value: unknown): boolean {
  if (!hasExactKeys(value, TRIP_CARGO_WEIGHT_KEYS)) return false
  return (
    isUnsignedInteger(value.documentsWithoutWeight) &&
    isString(value.grossWeightKilograms) &&
    (value.source === 'declared' || value.source === 'estimated')
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
    (value.source === 'declared' || value.source === 'estimated')
  )
}

function isDeliveryProof(value: unknown): value is DeliveryProof {
  if (!hasExactKeys(value, DELIVERY_PROOF_KEYS)) return false
  return (
    isString(value.createdAt) &&
    isString(value.downloadUrl) &&
    isString(value.expiresAt) &&
    isString(value.id) &&
    (value.kind === 'photo' || value.kind === 'signature') &&
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

function isOccurrence(value: unknown): value is TripOccurrence {
  if (!hasExactKeys(value, TRIP_OCCURRENCE_KEYS)) return false
  return (
    isString(value.createdAt) &&
    isString(value.id) &&
    isString(value.note) &&
    isString(value.occurrenceTypeId) &&
    isString(value.productCode) &&
    (value.stage === 'delivery' || value.stage === 'separation') &&
    isString(value.typeName)
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

function isOccurrenceType(value: unknown): value is OccurrenceType {
  if (
    !hasExactKeys(value, [
      'active',
      'emailBody',
      'emailSubject',
      'id',
      'name',
      'notifies',
      'stage',
    ] as const)
  ) {
    return false
  }
  return (
    isBoolean(value.active) &&
    isString(value.emailBody) &&
    isString(value.emailSubject) &&
    isString(value.id) &&
    isString(value.name) &&
    isBoolean(value.notifies) &&
    (value.stage === 'delivery' || value.stage === 'separation')
  )
}
