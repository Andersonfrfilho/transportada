/* Copyright (c) 2026 Ada Technology. MIT License. */
export const TRIPS_PATH = '/trips'

/** A nota bipada é procurada na listagem de NF-e; a chave é única por empresa, então uma basta. */
export const NFE_DOCUMENTS_PATH = '/nfe-documents'
export const SCAN_LOOKUP_LIMIT = 1

/**
 * Ler viagem é `fleet.read` — a tela mostra veículo e motorista. Escrever é permissão própria:
 * `fleet.manage` também apaga veículo e motorista, e quem monta a viagem não faz isso.
 */
export const TRIP_READ_PERMISSION = 'fleet.read'
export const TRIP_MANAGE_PERMISSION = 'trip.manage'

export const TRIP_ERROR = {
  FORBIDDEN: 'TRIP_FORBIDDEN',
  REQUEST_FAILED: 'TRIP_REQUEST_FAILED',
  RESPONSE_INVALID: 'TRIP_RESPONSE_INVALID',
} as const

export const TRIP_PAGE_SIZE = 25

/** Detalhe e lista compartilham o prefixo: invalidar a viagem precisa refazer a tabela também. */
export const TRIP_QUERY_KEY = 'trips'
export const TRIP_LIST_QUERY_KEY = [TRIP_QUERY_KEY, 'list'] as const

export const TRIP_FEEDBACK_KEY_BY_ERROR: Readonly<Record<string, string>> = {
  TRIP_CLOSED: 'closed',
  TRIP_DOCUMENT_ALREADY_DELIVERED: 'documentAlreadyDelivered',
  TRIP_DOCUMENT_ALREADY_LINKED: 'documentAlreadyLinked',
  TRIP_DOCUMENT_NOT_FOUND: 'documentNotFound',
  TRIP_DOCUMENT_REFERENCE_INVALID: 'documentReferenceInvalid',
  TRIP_DRIVER_DUPLICATED: 'driverDuplicated',
  TRIP_DRIVER_NOT_AVAILABLE: 'driverNotAvailable',
  TRIP_DRIVER_NOT_FOUND: 'driverNotFound',
  TRIP_FORBIDDEN: 'readOnly',
  TRIP_NOT_FOUND: 'notFound',
  TRIP_REQUEST_FAILED: 'requestFailed',
  TRIP_RESPONSE_INVALID: 'responseInvalid',
  TRIP_VEHICLE_NOT_AVAILABLE: 'vehicleNotAvailable',
  TRIP_VEHICLE_NOT_FOUND: 'vehicleNotFound',
}

export const TRIP_KEYS = [
  'companyId',
  'createdAt',
  'id',
  'status',
  'updatedAt',
  'vehicleId',
] as const

export const TRIP_DRIVER_KEYS = ['driverId', 'driverName', 'driverTaxId', 'position'] as const

export const TRIP_DOCUMENT_KEYS = [
  'createdAt',
  'deliveredAt',
  'freightCalculationId',
  'id',
  'nfeDocumentId',
  'releasedAt',
  'tripId',
  'updatedAt',
] as const

export const TRIP_DOCUMENT_DETAIL_KEYS = [
  ...TRIP_DOCUMENT_KEYS,
  'cteAuthorized',
  'fiscalStatus',
] as const

export const TRIP_DETAIL_KEYS = [...TRIP_KEYS, 'documents', 'drivers'] as const
