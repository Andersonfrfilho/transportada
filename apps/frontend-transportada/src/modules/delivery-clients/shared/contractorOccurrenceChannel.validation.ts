/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import {
  OCCURRENCE_CHANNEL_GROUP_KEYS,
  OCCURRENCE_CHANNEL_GROUP_OWNER_KEYS,
  OCCURRENCE_CHANNEL_KEYS,
  OCCURRENCE_CHANNEL_KINDS,
  type ContractorOccurrenceChannel,
  type ContractorOccurrenceChannelGroup,
} from './contractorOccurrenceChannel.types'

/** Resposta de API é entrada não confiável: chave a mais ou a menos recusa a resposta inteira. */
export class ContractorOccurrenceChannelResponseError extends Error {
  public constructor() {
    super('CONTRACTOR_OCCURRENCE_CHANNEL_RESPONSE_INVALID')
    this.name = 'ContractorOccurrenceChannelResponseError'
  }
}

function isNullableString(value: unknown): value is null | string {
  return value === null || typeof value === 'string'
}

function readData(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new ContractorOccurrenceChannelResponseError()
  }
  return (payload as { data?: unknown }).data
}

export function occurrenceChannelFromApi(payload: unknown): ContractorOccurrenceChannel {
  const data = readData(payload)
  if (
    !hasExactKeys(data, OCCURRENCE_CHANNEL_KEYS) ||
    typeof data.channel !== 'string' ||
    !(OCCURRENCE_CHANNEL_KINDS as readonly string[]).includes(data.channel) ||
    typeof data.emailFallback !== 'boolean' ||
    !isNullableString(data.groupJid) ||
    typeof data.groupName !== 'string' ||
    !isNullableString(data.mentionPhone) ||
    !isNullableString(data.updatedAt)
  ) {
    throw new ContractorOccurrenceChannelResponseError()
  }
  return data as unknown as ContractorOccurrenceChannel
}

function isGroup(value: unknown): value is ContractorOccurrenceChannelGroup {
  if (
    !hasExactKeys(value, OCCURRENCE_CHANNEL_GROUP_KEYS) ||
    typeof value.groupJid !== 'string' ||
    typeof value.name !== 'string'
  ) {
    return false
  }
  const owner = value.owner
  if (owner === null) return true
  return (
    hasExactKeys(owner, OCCURRENCE_CHANNEL_GROUP_OWNER_KEYS) &&
    typeof owner.id === 'string' &&
    (owner.kind === 'contractor' || owner.kind === 'driver') &&
    typeof owner.name === 'string'
  )
}

export function occurrenceChannelGroupsFromApi(
  payload: unknown,
): readonly ContractorOccurrenceChannelGroup[] {
  const data = readData(payload)
  if (!Array.isArray(data) || !data.every(isGroup)) {
    throw new ContractorOccurrenceChannelResponseError()
  }
  return data
}

export function occurrenceChannelTestSent(payload: unknown): true {
  const data = readData(payload)
  if (!hasExactKeys(data, ['sent']) || data.sent !== true) {
    throw new ContractorOccurrenceChannelResponseError()
  }
  return true
}

/** Telefone com DDD (10 ou 11 dígitos), com ou sem o 55, como a pessoa digita; a API normaliza. */
export function isOccurrenceMentionPhoneValid(value: string): boolean {
  const digits = value.replace(/\D/gu, '')
  const national = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  return national.length === 10 || national.length === 11
}
