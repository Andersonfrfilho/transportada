/* Copyright (c) 2026 Ada Technology. MIT License. */
export const MDFE_MANIFESTS_PATH = '/mdfe-manifests'
export const MDFE_MANIFEST_PREVIEW_PATH = `${MDFE_MANIFESTS_PATH}/preview`

export const MDFE_READ_PERMISSION = 'mdfe.read'
export const MDFE_MANAGE_PERMISSION = 'mdfe.manage'
export const MDFE_ISSUE_PERMISSION = 'mdfe.issue'
export const MDFE_CLOSE_PERMISSION = 'mdfe.close'
export const MDFE_CANCEL_PERMISSION = 'mdfe.cancel'

export const MDFE_MANIFEST_ERROR = {
  FORBIDDEN: 'MDFE_MANIFEST_FORBIDDEN',
  REQUEST_FAILED: 'MDFE_MANIFEST_REQUEST_FAILED',
  RESPONSE_INVALID: 'MDFE_MANIFEST_RESPONSE_INVALID',
} as const

export const MDFE_MANIFEST_PAGE_SIZE = 25

export const MDFE_CANCELLATION_JUSTIFICATION_MIN_LENGTH = 15
export const MDFE_CANCELLATION_JUSTIFICATION_MAX_LENGTH = 255

export const MDFE_MANIFEST_FEEDBACK_KEY_BY_ERROR: Readonly<Record<string, string>> = {
  MDFE_DOCUMENT_ALREADY_MANIFESTED: 'documentAlreadyManifested',
  MDFE_DOCUMENT_NOT_AUTHORIZED: 'documentNotAuthorized',
  MDFE_MANIFEST_ALREADY_CANCELLED: 'alreadyCancelled',
  MDFE_MANIFEST_ALREADY_CLOSED: 'alreadyClosed',
  MDFE_MANIFEST_ALREADY_DISCARDED: 'alreadyDiscarded',
  MDFE_MANIFEST_CANCELLATION_WINDOW_EXPIRED: 'windowExpired',
  MDFE_MANIFEST_FORBIDDEN: 'readOnly',
  MDFE_MANIFEST_IN_FLIGHT: 'inFlight',
  MDFE_MANIFEST_NOT_AUTHORIZED: 'notAuthorized',
  MDFE_MANIFEST_NOT_DISCARDABLE: 'notDiscardable',
  MDFE_MANIFEST_NOT_ISSUABLE: 'notIssuable',
  MDFE_MANIFEST_REQUEST_FAILED: 'requestFailed',
  MDFE_MANIFEST_RESPONSE_INVALID: 'responseInvalid',
}

export const MANIFEST_SUMMARY_KEYS = [
  'additionalInformation',
  'cargoProduct',
  'cargoProductNcm',
  'cargoType',
  'cargoUnit',
  'cargoValue',
  'cargoWeight',
  'contractorName',
  'contractorTaxId',
  'createdAt',
  'cteCount',
  'destinationState',
  'dischargePostalCode',
  'emitterType',
  'fiscalEnvironment',
  'fiscalNumber',
  'fiscalSeries',
  'freightValue',
  'id',
  'insuranceEndorsement',
  'lastRejection',
  'loadingPostalCode',
  'originState',
  'rntrc',
  'status',
  'transporterType',
  'tripStartedAt',
  'updatedAt',
  'vehicleId',
  'version',
] as const

export const MANIFEST_DETAIL_KEYS = [
  ...MANIFEST_SUMMARY_KEYS,
  'drivers',
  'items',
  'loadingCities',
] as const

export const MANIFEST_REJECTION_KEYS = ['attemptKind', 'code', 'message', 'occurredAt'] as const

export const MANIFEST_DRIVER_KEYS = ['driverId', 'driverName', 'driverTaxId', 'position'] as const

export const MANIFEST_ITEM_KEYS = [
  'accessKey',
  'cargoValue',
  'cargoWeight',
  'cteFiscalDocumentId',
  'dischargeCityCode',
  'dischargeCityName',
] as const

export const MANIFEST_LOADING_CITY_KEYS = ['cityCode', 'cityName', 'position'] as const

export const MANIFEST_PREVIEW_KEYS = [
  'blocked',
  'destinationState',
  'destinationStateOptions',
  'dischargeCities',
  'documents',
  'fiscalEnvironment',
  'loadingCities',
  'originState',
  'totals',
] as const

export const MANIFEST_BLOCK_KEYS = ['fiscalDocumentId', 'reason'] as const

export const MANIFEST_DOCUMENT_KEYS = [
  'accessKey',
  'cargoValue',
  'cargoWeight',
  'dischargeCityCode',
  'dischargeCityName',
  'dischargeState',
  'fiscalDocumentId',
  'originCityCode',
  'originCityName',
  'originState',
] as const

export const MANIFEST_CITY_KEYS = ['cityCode', 'cityName', 'state'] as const

export const MANIFEST_DISCHARGE_CITY_KEYS = [...MANIFEST_CITY_KEYS, 'accessKeys'] as const

export const MANIFEST_TOTALS_KEYS = ['cargoValue', 'cargoWeight', 'cteCount'] as const

export const MANIFEST_ISSUANCE_SUMMARY_KEYS = [
  'attemptId',
  'attemptKind',
  'manifestId',
  'manifestStatus',
  'replayed',
  'requestedAt',
] as const

export const MANIFEST_CREATE_BODY_KEYS = [
  'additionalInformation',
  'cargoProduct',
  'cargoProductNcm',
  'cargoType',
  'cargoUnit',
  'contractorName',
  'contractorTaxId',
  'destinationState',
  'dischargePostalCode',
  'documentIds',
  'driverIds',
  'emitterType',
  'freightValue',
  'insuranceEndorsement',
  'loadingPostalCode',
  'transporterType',
  'tripStartedAt',
  'vehicleId',
] as const
