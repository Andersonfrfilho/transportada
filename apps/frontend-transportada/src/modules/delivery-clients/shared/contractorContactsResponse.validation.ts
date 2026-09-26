/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import {
  CONTRACTOR_CONTACT_CHANNELS,
  CONTRACTOR_CONTACT_KEYS,
  CONTRACTOR_CONTACT_OCCURRENCE_STAGES,
  CONTRACTOR_CONTACT_TYPES,
  CONTRACTOR_KEYS,
  type ContractorContact,
  type ContractorSummary,
} from './contractorContacts.types'

/**
 * Resposta de API é entrada não confiável (`security.md` §3). `hasExactKeys` recusa a resposta
 * inteira, com erro explícito, em vez de deixar um campo a mais ou a menos atravessar até um `.map`
 * estourar em silêncio (mesmo defeito medido no `VEHICLE_DETAIL_KEYS`, ver
 * `contractorMailSettingsResponse.validation.ts`).
 */
export class ContractorContactsResponseError extends Error {
  public constructor() {
    super('CONTRACTOR_CONTACTS_RESPONSE_INVALID')
    this.name = 'ContractorContactsResponseError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is TOption {
  return typeof value === 'string' && options.includes(value as TOption)
}

function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

function isListOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is readonly TOption[] {
  return Array.isArray(value) && value.every((item) => isOneOf(item, options))
}

function isContact(value: unknown): value is ContractorContact {
  if (!hasExactKeys(value, CONTRACTOR_CONTACT_KEYS)) return false
  return (
    typeof value.canDecide === 'boolean' &&
    isString(value.contractorId) &&
    isString(value.email) &&
    isString(value.id) &&
    isString(value.name) &&
    isListOf(value.occurrenceStages, CONTRACTOR_CONTACT_OCCURRENCE_STAGES) &&
    isNullableString(value.phone) &&
    isOneOf(value.preferredChannel, CONTRACTOR_CONTACT_CHANNELS) &&
    typeof value.receivesOccurrences === 'boolean' &&
    isString(value.roleLabel) &&
    isOneOf(value.status, ['active', 'inactive']) &&
    isListOf(value.types, CONTRACTOR_CONTACT_TYPES) &&
    isNullableString(value.whatsappOptInAt) &&
    isNullableString(value.whatsappOptInByUserId)
  )
}

function isContractor(value: unknown): value is ContractorSummary {
  if (!hasExactKeys(value, CONTRACTOR_KEYS)) return false
  return isString(value.displayName) && isString(value.id) && isString(value.taxId)
}

export function contactsFromApi(payload: unknown): readonly ContractorContact[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new ContractorContactsResponseError()
  }
  if (!payload.data.every(isContact)) throw new ContractorContactsResponseError()
  return payload.data
}

export function contactFromApi(payload: unknown): ContractorContact {
  if (!isRecord(payload) || !isContact(payload.data)) throw new ContractorContactsResponseError()
  return payload.data
}

export function contractorsFromApi(payload: unknown): readonly ContractorSummary[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new ContractorContactsResponseError()
  }
  if (!payload.data.every(isContractor)) throw new ContractorContactsResponseError()
  return payload.data.map((contractor) => ({
    displayName: contractor.displayName,
    id: contractor.id,
    taxId: contractor.taxId,
  }))
}
