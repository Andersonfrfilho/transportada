/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import {
  CARGO_PREVIEW_ITEM_STATES,
  CARGO_PREVIEW_LOAD_ORIGINS,
  CARGO_PREVIEW_SOURCES,
  CARGO_PREVIEW_STATUSES,
} from './cargoPreview.constant'
import type {
  CargoPreviewArrivalProposal,
  CargoPreviewItemOutcome,
  CargoPreviewRouteGroup,
  CargoPreviewStateCounts,
  CargoPreviewSummary,
} from './cargoPreview.types'

/**
 * Resposta de API é entrada não confiável (`security.md` §3): as chaves são conferidas EXATAS, em cada
 * nível, no formato real de `cargo-preview.types.ts` da API. Chave a mais ou a menos recusa a resposta
 * inteira, em vez de deixar passar calada até quebrar a tela.
 */
const COUNTS_KEYS = [...CARGO_PREVIEW_ITEM_STATES, 'total'] as const
export const PREVIEW_SUMMARY_KEYS = [
  'arrivalId',
  'contractorId',
  'contractorName',
  'createdAt',
  'errorCode',
  'fileName',
  'fileSha256',
  'fileSizeBytes',
  'id',
  'plannedDate',
  'receivedAt',
  'rowCount',
  'sheetName',
  'source',
  'status',
  'updatedAt',
] as const
const ROUTE_KEYS = ['counts', 'loadOrigin', 'loadReference', 'routeName'] as const
const PROPOSAL_KEYS = [
  'contractorId',
  'documentIds',
  'plannedDate',
  'previewId',
  'refused',
] as const

export function isOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is TOption {
  return typeof value === 'string' && options.includes(value as TOption)
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value))
}

export function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

export function isStateCounts(value: unknown): value is CargoPreviewStateCounts {
  return (
    hasExactKeys(value, COUNTS_KEYS) && COUNTS_KEYS.every((key) => Number.isInteger(value[key]))
  )
}

export function isPreviewSummary(value: unknown): value is CargoPreviewSummary {
  if (!hasExactKeys(value, PREVIEW_SUMMARY_KEYS)) return false
  return (
    isOneOf(value.status, CARGO_PREVIEW_STATUSES) &&
    isOneOf(value.source, CARGO_PREVIEW_SOURCES) &&
    isNullableString(value.arrivalId) &&
    isNullableString(value.contractorName) &&
    isNullableString(value.errorCode) &&
    isNullableString(value.plannedDate) &&
    isNullableString(value.sheetName) &&
    isNullableInteger(value.rowCount) &&
    typeof value.contractorId === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.fileName === 'string' &&
    typeof value.fileSha256 === 'string' &&
    Number.isInteger(value.fileSizeBytes) &&
    typeof value.id === 'string' &&
    typeof value.receivedAt === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

export function isRouteGroup(value: unknown): value is CargoPreviewRouteGroup {
  return (
    hasExactKeys(value, ROUTE_KEYS) &&
    isStateCounts(value.counts) &&
    (value.loadOrigin === null || isOneOf(value.loadOrigin, CARGO_PREVIEW_LOAD_ORIGINS)) &&
    isNullableString(value.loadReference) &&
    typeof value.routeName === 'string'
  )
}

/** Recusada leva o motivo; a API nunca manda a nota sem dizer por quê. */
function isRefusedDocument(value: unknown): boolean {
  return (
    hasExactKeys(value, ['documentId', 'reason']) &&
    typeof value.documentId === 'string' &&
    typeof value.reason === 'string'
  )
}

export function isArrivalProposal(value: unknown): value is CargoPreviewArrivalProposal {
  return (
    hasExactKeys(value, PROPOSAL_KEYS) &&
    isStringList(value.documentIds) &&
    isNullableString(value.plannedDate) &&
    typeof value.contractorId === 'string' &&
    typeof value.previewId === 'string' &&
    Array.isArray(value.refused) &&
    value.refused.every(isRefusedDocument)
  )
}

export function isItemOutcome(value: unknown): value is CargoPreviewItemOutcome {
  return (
    hasExactKeys(value, ['itemIds', 'outcome']) &&
    isStringList(value.itemIds) &&
    (value.outcome === 'changed' || value.outcome === 'unchanged')
  )
}
