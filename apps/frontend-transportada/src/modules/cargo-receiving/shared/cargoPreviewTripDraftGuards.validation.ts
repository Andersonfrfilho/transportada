/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import { CARGO_PREVIEW_LOAD_ORIGINS, CARGO_PREVIEW_STATUSES } from './cargoPreview.constant'
import { CARGO_TRIP_DRAFT_CANNOT_PROPOSE_REASONS } from './cargoPreviewTripDraft.constant'
import type { CargoPreviewTripDrafts } from './cargoPreviewTripDraft.types'
import {
  isNullableString,
  isOneOf,
  isStateCounts,
  isStringList,
} from './cargoPreviewGuards.validation'

/**
 * Resposta de API é entrada não confiável (`security.md` §3): as chaves são conferidas EXATAS em cada nível, no
 * formato real de `GET /cargo-previews/:id/trip-drafts`. Chave a mais ou a menos recusa a resposta inteira.
 */
const DRAFTS_KEYS = [
  'contractorId',
  'plannedDate',
  'previewId',
  'routableDocumentIds',
  'routes',
  'status',
  'summary',
] as const
const SUMMARY_KEYS = [
  'canPropose',
  'counts',
  'inLiveTripDocumentCount',
  'linkedDocumentCount',
  'missingCount',
  'routableDocumentCount',
  'routeCount',
] as const
const ROUTE_KEYS = [
  'canPropose',
  'cannotProposeReason',
  'cities',
  'counts',
  'documents',
  'linkedTotals',
  'loadOrigin',
  'loadReference',
  'missingCount',
  'plannedDate',
  'routableDocumentIds',
  'routeName',
  'totals',
] as const
const DOCUMENT_KEYS = [
  'cityIbgeCode',
  'cityName',
  'documentId',
  'isInLiveTrip',
  'isRoutable',
  'lineCount',
  'number',
  'recipientName',
  'series',
  'status',
  'totalValue',
  'weightKg',
] as const
const CITY_KEYS = ['cityIbgeCode', 'cityName', 'documentCount', 'pendingLineCount'] as const
const TOTALS_KEYS = ['value', 'volumeM3', 'weightKg'] as const
const LINKED_TOTALS_KEYS = ['value', 'weightKg'] as const

const isCount = (value: unknown): value is number => Number.isInteger(value)

function isCity(value: unknown): boolean {
  return (
    hasExactKeys(value, CITY_KEYS) &&
    isNullableString(value.cityIbgeCode) &&
    isNullableString(value.cityName) &&
    isCount(value.documentCount) &&
    isCount(value.pendingLineCount)
  )
}

function isDocument(value: unknown): boolean {
  return (
    hasExactKeys(value, DOCUMENT_KEYS) &&
    isNullableString(value.cityIbgeCode) &&
    isNullableString(value.cityName) &&
    isNullableString(value.recipientName) &&
    isNullableString(value.weightKg) &&
    typeof value.documentId === 'string' &&
    typeof value.isInLiveTrip === 'boolean' &&
    typeof value.isRoutable === 'boolean' &&
    isCount(value.lineCount) &&
    typeof value.number === 'string' &&
    typeof value.series === 'string' &&
    typeof value.status === 'string' &&
    typeof value.totalValue === 'string'
  )
}

function areTotals(value: unknown): boolean {
  return (
    hasExactKeys(value, TOTALS_KEYS) &&
    typeof value.value === 'string' &&
    isNullableString(value.volumeM3) &&
    typeof value.weightKg === 'string'
  )
}

function areLinkedTotals(value: unknown): boolean {
  return (
    hasExactKeys(value, LINKED_TOTALS_KEYS) &&
    typeof value.value === 'string' &&
    typeof value.weightKg === 'string'
  )
}

function isRoute(value: unknown): boolean {
  return (
    hasExactKeys(value, ROUTE_KEYS) &&
    typeof value.canPropose === 'boolean' &&
    (value.cannotProposeReason === null ||
      isOneOf(value.cannotProposeReason, CARGO_TRIP_DRAFT_CANNOT_PROPOSE_REASONS)) &&
    Array.isArray(value.cities) &&
    value.cities.every(isCity) &&
    isStateCounts(value.counts) &&
    Array.isArray(value.documents) &&
    value.documents.every(isDocument) &&
    areLinkedTotals(value.linkedTotals) &&
    (value.loadOrigin === null || isOneOf(value.loadOrigin, CARGO_PREVIEW_LOAD_ORIGINS)) &&
    isNullableString(value.loadReference) &&
    isCount(value.missingCount) &&
    isNullableString(value.plannedDate) &&
    isStringList(value.routableDocumentIds) &&
    isNullableString(value.routeName) &&
    areTotals(value.totals)
  )
}

function isSummary(value: unknown): boolean {
  return (
    hasExactKeys(value, SUMMARY_KEYS) &&
    typeof value.canPropose === 'boolean' &&
    isStateCounts(value.counts) &&
    isCount(value.inLiveTripDocumentCount) &&
    isCount(value.linkedDocumentCount) &&
    isCount(value.missingCount) &&
    isCount(value.routableDocumentCount) &&
    isCount(value.routeCount)
  )
}

export function isTripDrafts(value: unknown): value is CargoPreviewTripDrafts {
  return (
    hasExactKeys(value, DRAFTS_KEYS) &&
    typeof value.contractorId === 'string' &&
    isNullableString(value.plannedDate) &&
    typeof value.previewId === 'string' &&
    isStringList(value.routableDocumentIds) &&
    Array.isArray(value.routes) &&
    value.routes.every(isRoute) &&
    isOneOf(value.status, CARGO_PREVIEW_STATUSES) &&
    isSummary(value.summary)
  )
}
