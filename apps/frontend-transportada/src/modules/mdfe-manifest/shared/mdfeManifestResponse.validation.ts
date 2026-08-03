/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  MANIFEST_BLOCK_KEYS,
  MANIFEST_CITY_KEYS,
  MANIFEST_DETAIL_KEYS,
  MANIFEST_DISCHARGE_CITY_KEYS,
  MANIFEST_DOCUMENT_KEYS,
  MANIFEST_DRIVER_KEYS,
  MANIFEST_ISSUANCE_SUMMARY_KEYS,
  MANIFEST_ITEM_KEYS,
  MANIFEST_LOADING_CITY_KEYS,
  MANIFEST_PREVIEW_KEYS,
  MANIFEST_REJECTION_KEYS,
  MANIFEST_SUMMARY_KEYS,
  MANIFEST_TOTALS_KEYS,
  MDFE_MANIFEST_ERROR,
} from './mdfeManifest.constant'
import type {
  MdfeDocumentBlock,
  MdfeIssuanceSummary,
  MdfeManifestCity,
  MdfeManifestDetail,
  MdfeManifestDischargeCity,
  MdfeManifestDriverLine,
  MdfeManifestItemLine,
  MdfeManifestLoadingCityLine,
  MdfeManifestPage,
  MdfeManifestPreview,
  MdfeManifestRejection,
  MdfeManifestSummary,
  MdfeManifestTotals,
  MdfeManifestableDocument,
} from './mdfeManifest.types'
import {
  hasExactKeys,
  isBoolean,
  isDecimalString,
  isNullableString,
  isOneOf,
  isOptionalOneOf,
  isRecord,
  isString,
  isStringArray,
  isUnsignedInteger,
  isUnsignedIntegerString,
  MDFE_ENUMS,
} from './mdfeManifestGuards.validation'

function invalid(): Error {
  return new Error(MDFE_MANIFEST_ERROR.RESPONSE_INVALID)
}

function isRejection(value: unknown): value is MdfeManifestRejection {
  if (!hasExactKeys(value, MANIFEST_REJECTION_KEYS)) return false
  return (
    isOneOf(value.attemptKind, MDFE_ENUMS.attemptKind) &&
    isString(value.code) &&
    isNullableString(value.message) &&
    isString(value.occurredAt)
  )
}

function isSummary(value: unknown): value is MdfeManifestSummary {
  if (!hasExactKeys(value, MANIFEST_SUMMARY_KEYS)) return false
  return (
    isString(value.additionalInformation) &&
    isString(value.cargoProduct) &&
    isString(value.cargoProductNcm) &&
    isOptionalOneOf(value.cargoType, MDFE_ENUMS.cargoType) &&
    isOneOf(value.cargoUnit, MDFE_ENUMS.cargoUnit) &&
    isDecimalString(value.cargoValue) &&
    isDecimalString(value.cargoWeight) &&
    isString(value.contractorName) &&
    isString(value.contractorTaxId) &&
    isString(value.createdAt) &&
    isUnsignedInteger(value.cteCount) &&
    isString(value.destinationState) &&
    isString(value.dischargePostalCode) &&
    isOneOf(value.emitterType, MDFE_ENUMS.emitterType) &&
    isOneOf(value.fiscalEnvironment, MDFE_ENUMS.fiscalEnvironment) &&
    isNullableString(value.fiscalNumber) &&
    isString(value.fiscalSeries) &&
    isDecimalString(value.freightValue) &&
    isString(value.id) &&
    isString(value.insuranceEndorsement) &&
    (value.lastRejection === null || isRejection(value.lastRejection)) &&
    isString(value.loadingPostalCode) &&
    isString(value.originState) &&
    isString(value.rntrc) &&
    isOneOf(value.status, MDFE_ENUMS.status) &&
    isOptionalOneOf(value.transporterType, MDFE_ENUMS.transporterType) &&
    isNullableString(value.tripStartedAt) &&
    isString(value.updatedAt) &&
    isString(value.vehicleId) &&
    isUnsignedIntegerString(value.version)
  )
}

function isDriverLine(value: unknown): value is MdfeManifestDriverLine {
  if (!hasExactKeys(value, MANIFEST_DRIVER_KEYS)) return false
  return (
    isString(value.driverId) &&
    isString(value.driverName) &&
    isString(value.driverTaxId) &&
    isUnsignedInteger(value.position)
  )
}

function isItemLine(value: unknown): value is MdfeManifestItemLine {
  if (!hasExactKeys(value, MANIFEST_ITEM_KEYS)) return false
  return (
    isString(value.accessKey) &&
    isDecimalString(value.cargoValue) &&
    isDecimalString(value.cargoWeight) &&
    isString(value.cteFiscalDocumentId) &&
    isString(value.dischargeCityCode) &&
    isString(value.dischargeCityName)
  )
}

function isLoadingCityLine(value: unknown): value is MdfeManifestLoadingCityLine {
  if (!hasExactKeys(value, MANIFEST_LOADING_CITY_KEYS)) return false
  return isString(value.cityCode) && isString(value.cityName) && isUnsignedInteger(value.position)
}

function isEveryItem<TItem>(value: unknown, guard: (item: unknown) => item is TItem): boolean {
  return Array.isArray(value) && value.every(guard)
}

function isDetail(value: unknown): value is MdfeManifestDetail {
  if (!hasExactKeys(value, MANIFEST_DETAIL_KEYS)) return false
  const { drivers, items, loadingCities, ...summary } = value
  return (
    isSummary(summary) &&
    isEveryItem(drivers, isDriverLine) &&
    isEveryItem(items, isItemLine) &&
    isEveryItem(loadingCities, isLoadingCityLine)
  )
}

function isBlock(value: unknown): value is MdfeDocumentBlock {
  if (!hasExactKeys(value, MANIFEST_BLOCK_KEYS)) return false
  return isString(value.fiscalDocumentId) && isString(value.reason)
}

function isDocument(value: unknown): value is MdfeManifestableDocument {
  if (!hasExactKeys(value, MANIFEST_DOCUMENT_KEYS)) return false
  return (
    isString(value.accessKey) &&
    isDecimalString(value.cargoValue) &&
    isDecimalString(value.cargoWeight) &&
    isString(value.dischargeCityCode) &&
    isString(value.dischargeCityName) &&
    isString(value.dischargeState) &&
    isString(value.fiscalDocumentId) &&
    isString(value.originCityCode) &&
    isString(value.originCityName) &&
    isString(value.originState)
  )
}

function isCity(value: unknown): value is MdfeManifestCity {
  if (!hasExactKeys(value, MANIFEST_CITY_KEYS)) return false
  return isString(value.cityCode) && isString(value.cityName) && isString(value.state)
}

function isDischargeCity(value: unknown): value is MdfeManifestDischargeCity {
  if (!hasExactKeys(value, MANIFEST_DISCHARGE_CITY_KEYS)) return false
  const { accessKeys, ...city } = value
  return isCity(city) && isStringArray(accessKeys)
}

function isTotals(value: unknown): value is MdfeManifestTotals {
  if (!hasExactKeys(value, MANIFEST_TOTALS_KEYS)) return false
  return (
    isDecimalString(value.cargoValue) &&
    isDecimalString(value.cargoWeight) &&
    isUnsignedInteger(value.cteCount)
  )
}

function isPreview(value: unknown): value is MdfeManifestPreview {
  if (!hasExactKeys(value, MANIFEST_PREVIEW_KEYS)) return false
  return (
    isEveryItem(value.blocked, isBlock) &&
    isString(value.destinationState) &&
    isStringArray(value.destinationStateOptions) &&
    isEveryItem(value.dischargeCities, isDischargeCity) &&
    isEveryItem(value.documents, isDocument) &&
    isOneOf(value.fiscalEnvironment, MDFE_ENUMS.fiscalEnvironment) &&
    isEveryItem(value.loadingCities, isCity) &&
    isString(value.originState) &&
    isTotals(value.totals)
  )
}

function isIssuanceSummary(value: unknown): value is MdfeIssuanceSummary {
  if (!hasExactKeys(value, MANIFEST_ISSUANCE_SUMMARY_KEYS)) return false
  return (
    isString(value.attemptId) &&
    isOneOf(value.attemptKind, MDFE_ENUMS.attemptKind) &&
    isString(value.manifestId) &&
    isOneOf(value.manifestStatus, MDFE_ENUMS.status) &&
    isBoolean(value.replayed) &&
    isString(value.requestedAt)
  )
}

export function createMdfeManifestResponseAdapters() {
  function manifestFromApi(input: unknown): MdfeManifestSummary {
    if (!isSummary(input)) throw invalid()
    return input
  }

  return {
    issuanceSummaryFromApi(input: unknown): MdfeIssuanceSummary {
      if (!isIssuanceSummary(input)) throw invalid()
      return input
    },
    manifestDetailFromApi(input: unknown): MdfeManifestDetail {
      if (!isDetail(input)) throw invalid()
      return input
    },
    manifestFromApi,
    manifestListFromApi(input: unknown): MdfeManifestPage {
      if (!isRecord(input) || !Array.isArray(input.data) || !isRecord(input.page)) throw invalid()
      const nextCursor = input.page.nextCursor
      if (!isNullableString(nextCursor)) throw invalid()
      return { items: input.data.map(manifestFromApi), nextCursor }
    },
    previewFromApi(input: unknown): MdfeManifestPreview {
      if (!isPreview(input)) throw invalid()
      return input
    },
  }
}
