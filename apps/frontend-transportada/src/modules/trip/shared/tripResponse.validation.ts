/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  TRIP_DETAIL_KEYS,
  TRIP_DOCUMENT_DETAIL_KEYS,
  TRIP_DOCUMENT_KEYS,
  TRIP_DRIVER_KEYS,
  TRIP_ERROR,
  TRIP_KEYS,
} from './trip.constant'
import { SCANNED_NFE_STATUS, TRIP_STATUS } from './trip.types'
import type {
  ScannedNfeDocument,
  Trip,
  TripDetail,
  TripDocument,
  TripDocumentDetail,
  TripDriverLine,
  TripPage,
} from './trip.types'
import {
  hasExactKeys,
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
    isNullableString(value.freightCalculationId) &&
    isString(value.id) &&
    isNullableString(value.nfeDocumentId) &&
    isNullableString(value.releasedAt) &&
    isString(value.tripId) &&
    isString(value.updatedAt)
  )
}

function isDocument(value: unknown): value is TripDocument {
  if (!hasExactKeys(value, TRIP_DOCUMENT_KEYS)) return false
  return isDocumentFields(value)
}

function isDocumentDetail(value: unknown): value is TripDocumentDetail {
  if (!hasExactKeys(value, TRIP_DOCUMENT_DETAIL_KEYS)) return false
  return isDocumentFields(value) && isBoolean(value.cteAuthorized) && isString(value.fiscalStatus)
}

function isDetail(value: unknown): value is TripDetail {
  if (!hasExactKeys(value, TRIP_DETAIL_KEYS)) return false
  return (
    isTripFields(value) &&
    isEveryItem(value.documents, isDocumentDetail) &&
    isEveryItem(value.drivers, isDriverLine)
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

export function createTripResponseAdapters() {
  function tripFromApi(input: unknown): Trip {
    if (!isTrip(input)) throw invalid()
    return input
  }

  return {
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
    tripFromApi,
    tripListFromApi(input: unknown): TripPage {
      if (!isRecord(input) || !Array.isArray(input.data) || !isRecord(input.page)) throw invalid()
      const nextCursor = input.page.nextCursor
      if (!isNullableString(nextCursor)) throw invalid()
      return { items: input.data.map(tripFromApi), nextCursor }
    },
  }
}
