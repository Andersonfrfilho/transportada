/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DeliveryProof } from './deliveryProof.service'
import {
  BATCH_STATUS_RESULT_KEYS,
  DELIVERY_ADDRESS_OVERRIDE_KEYS,
  STOP_ADDRESS_COMPONENTS_KEYS,
  TRANSITION_RESULT_KEYS,
  TRIP_DETAIL_KEYS,
  TRIP_DETAIL_OPTIONAL_KEYS,
  DELIVERY_PROOF_KEYS,
  TRIP_CARGO_WEIGHT_KEYS,
  TRIP_OCCUPANCY_KEYS,
  TRIP_DOCUMENT_DETAIL_KEYS,
  TRIP_DOCUMENT_DETAIL_OPTIONAL_KEYS,
  TRIP_DOCUMENT_KEYS,
  TRIP_DRIVER_KEYS,
  TRIP_ERROR,
  TRIP_KEYS,
  TRIP_STATUS_RESULT_KEYS,
  TRIP_STOP_KEYS,
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

function invalid(): Error {
  return new Error(TRIP_ERROR.RESPONSE_INVALID)
}

function isTripFields(value: Record<string, unknown>): boolean {
  return (
    isString(value.companyId) &&
    isString(value.createdAt) &&
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

function isDriverLine(value: unknown): value is TripDriverLine {
  if (!hasExactKeys(value, TRIP_DRIVER_KEYS)) return false
  return (
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
  if (!hasExactKeys(value, TRIP_STOP_KEYS)) return false
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
        series: row.series,
        status: row.status,
        totalAmount: row.totalAmount,
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
