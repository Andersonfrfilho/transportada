/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import type {
  AvailableCargoDocument,
  CargoArrivalDetail,
  CargoArrivalDocument,
  CargoArrivalGroup,
  CargoArrivalSummary,
  CargoDocumentOutcome,
  CargoStateCounts,
} from './cargoArrival.types'
import { CARGO_ARRIVAL_STATUSES, CARGO_DOCUMENT_STATES } from './cargoReceiving.constant'

/**
 * Resposta de API é entrada não confiável (`security.md` §3): as chaves são conferidas EXATAS, em cada
 * nível, no formato real de `cargo-arrival-view.mapper.ts`. Chave a mais ou a menos recusa a resposta
 * inteira, em vez de deixar passar calada até quebrar a tela.
 */
const COUNTS_KEYS = ['expected', 'received', 'separated', 'total'] as const
const SUMMARY_KEYS = [
  'arrivedAt',
  'contractorId',
  'contractorName',
  'counts',
  'createdAt',
  'deliveryDeadlineBusinessDays',
  'id',
  'isSeparationOverdue',
  'palletCount',
  'reference',
  'separationDueAt',
  'separationWindowHours',
  'status',
] as const
const GROUP_KEYS = ['cityIbgeCode', 'counts', 'documents', 'routeName'] as const
const DOCUMENT_KEYS = [
  'accessKey',
  'cityIbgeCode',
  'cityName',
  'isInLiveTrip',
  'nfeDocumentId',
  'number',
  'receivedAt',
  'recipientName',
  'routeName',
  'separatedAt',
  'separationState',
  'series',
] as const
const AVAILABLE_KEYS = [
  'accessKey',
  'cityIbgeCode',
  'cityName',
  'id',
  'issuedAt',
  'number',
  'recipientName',
  'series',
  'state',
  'totalValue',
] as const

function isOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is TOption {
  return typeof value === 'string' && options.includes(value as TOption)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value))
}

function isCounts(value: unknown): value is CargoStateCounts {
  return (
    hasExactKeys(value, COUNTS_KEYS) && COUNTS_KEYS.every((key) => Number.isInteger(value[key]))
  )
}

export function isArrivalSummary(value: unknown): value is CargoArrivalSummary {
  if (!hasExactKeys(value, SUMMARY_KEYS)) return false
  return (
    isOneOf(value.status, CARGO_ARRIVAL_STATUSES) &&
    isCounts(value.counts) &&
    isNullableInteger(value.deliveryDeadlineBusinessDays) &&
    isNullableInteger(value.palletCount) &&
    isNullableInteger(value.separationWindowHours) &&
    isNullableString(value.reference) &&
    isNullableString(value.separationDueAt) &&
    typeof value.isSeparationOverdue === 'boolean' &&
    typeof value.arrivedAt === 'string' &&
    typeof value.contractorId === 'string' &&
    typeof value.contractorName === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.id === 'string'
  )
}

function isDocument(value: unknown): value is CargoArrivalDocument {
  if (!hasExactKeys(value, DOCUMENT_KEYS)) return false
  return (
    isOneOf(value.separationState, CARGO_DOCUMENT_STATES) &&
    isNullableString(value.cityIbgeCode) &&
    isNullableString(value.cityName) &&
    isNullableString(value.receivedAt) &&
    isNullableString(value.recipientName) &&
    isNullableString(value.routeName) &&
    isNullableString(value.separatedAt) &&
    typeof value.isInLiveTrip === 'boolean' &&
    typeof value.accessKey === 'string' &&
    typeof value.nfeDocumentId === 'string' &&
    typeof value.number === 'string' &&
    typeof value.series === 'string'
  )
}

function isGroup(value: unknown): value is CargoArrivalGroup {
  return (
    hasExactKeys(value, GROUP_KEYS) &&
    isCounts(value.counts) &&
    isNullableString(value.cityIbgeCode) &&
    isNullableString(value.routeName) &&
    Array.isArray(value.documents) &&
    value.documents.every(isDocument)
  )
}

export function isArrivalDetail(value: unknown): value is CargoArrivalDetail {
  if (!hasExactKeys(value, [...SUMMARY_KEYS, 'groups'])) return false
  const { groups, ...summary } = value
  return isArrivalSummary(summary) && Array.isArray(groups) && groups.every(isGroup)
}

export function isAvailableDocument(value: unknown): value is AvailableCargoDocument {
  return (
    hasExactKeys(value, AVAILABLE_KEYS) &&
    isNullableString(value.cityIbgeCode) &&
    isNullableString(value.cityName) &&
    isNullableString(value.recipientName) &&
    isNullableString(value.state) &&
    typeof value.accessKey === 'string' &&
    typeof value.id === 'string' &&
    typeof value.issuedAt === 'string' &&
    typeof value.number === 'string' &&
    typeof value.series === 'string' &&
    typeof value.totalValue === 'string'
  )
}

/** Recusada leva o motivo; alterada e sem mudança não levam — a API nunca mistura os dois. */
export function isDocumentOutcome(value: unknown): value is CargoDocumentOutcome {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record: Record<string, unknown> = { ...value }
  if (typeof record.documentId !== 'string') return false
  if (record.outcome === 'refused') {
    return (
      hasExactKeys(record, ['documentId', 'outcome', 'reason']) && typeof record.reason === 'string'
    )
  }
  return (
    (record.outcome === 'changed' || record.outcome === 'unchanged') &&
    hasExactKeys(record, ['documentId', 'outcome'])
  )
}
