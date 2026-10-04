/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import { CONTRACTOR_KEYS } from './contractorContacts.types'
import {
  CONTRACTOR_CLOSING_PERIODS,
  CONTRACTOR_DIRECTORY_ERROR,
  CONTRACTOR_STATUSES,
  type Contractor,
  type ContractorPage,
} from './contractorDirectory.types'
import { ContractorDirectoryRequestError } from './contractorDirectoryRequest.service'
import {
  PREVIEW_ITEM_FIELDS,
  RECEIVING_PROFILE_KEYS,
  type PreviewColumnMap,
  type ReceivingProfile,
} from './receivingProfile.types'

/**
 * Resposta de API é entrada não confiável (`security.md` §3): a guarda recusa a resposta inteira,
 * com erro explícito, em vez de deixar passar chave a mais ou a menos até quebrar em silêncio.
 */
function invalidResponse(): ContractorDirectoryRequestError {
  return new ContractorDirectoryRequestError(CONTRACTOR_DIRECTORY_ERROR.RESPONSE_INVALID)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is TOption {
  return typeof value === 'string' && options.includes(value as TOption)
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value))
}

function isContractor(value: unknown): value is Contractor {
  if (!hasExactKeys(value, CONTRACTOR_KEYS)) return false
  return (
    isOneOf(value.closingPeriod, CONTRACTOR_CLOSING_PERIODS) &&
    isOneOf(value.status, CONTRACTOR_STATUSES) &&
    typeof value.displayName === 'string' &&
    typeof value.id === 'string' &&
    typeof value.notes === 'string' &&
    typeof value.reportEmail === 'string' &&
    typeof value.taxId === 'string'
  )
}

function isPreviewColumnMap(value: unknown): value is PreviewColumnMap | null {
  if (value === null) return true
  if (!isRecord(value)) return false
  return Object.entries(value).every(
    ([field, columnName]) => isOneOf(field, PREVIEW_ITEM_FIELDS) && typeof columnName === 'string',
  )
}

function isReceivingProfile(value: unknown): value is ReceivingProfile {
  if (!hasExactKeys(value, RECEIVING_PROFILE_KEYS)) return false
  return (
    (value.arrivalReferenceLabel === null || typeof value.arrivalReferenceLabel === 'string') &&
    (value.previewSheetName === null || typeof value.previewSheetName === 'string') &&
    isNullableInteger(value.deliveryDeadlineBusinessDays) &&
    isNullableInteger(value.separationWindowHours) &&
    isPreviewColumnMap(value.previewColumnMap) &&
    typeof value.isEnabled === 'boolean' &&
    typeof value.previewEnabled === 'boolean' &&
    typeof value.requiresDamageCheck === 'boolean' &&
    typeof value.matchWindowDays === 'number' &&
    typeof value.weightTolerancePercent === 'number' &&
    typeof value.contractorId === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

export function toContractorPage(payload: unknown): ContractorPage {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.page)) {
    throw invalidResponse()
  }
  const { nextCursor } = payload.page
  if (nextCursor !== null && typeof nextCursor !== 'string') throw invalidResponse()
  if (!payload.data.every(isContractor)) throw invalidResponse()
  return { items: payload.data, nextCursor }
}

export function toContractor(payload: unknown): Contractor {
  if (!isRecord(payload) || !isContractor(payload.data)) throw invalidResponse()
  return payload.data
}

/** `{ data: null }` é contratante sem perfil — ausência de regra, e não erro (ADR-0094 §5). */
export function toReceivingProfileOrNull(payload: unknown): ReceivingProfile | null {
  if (!isRecord(payload)) throw invalidResponse()
  if (payload.data === null) return null
  if (!isReceivingProfile(payload.data)) throw invalidResponse()
  return payload.data
}

export function toReceivingProfile(payload: unknown): ReceivingProfile {
  const profile = toReceivingProfileOrNull(payload)
  if (profile === null) throw invalidResponse()
  return profile
}
