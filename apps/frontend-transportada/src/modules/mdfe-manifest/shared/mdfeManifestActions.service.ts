/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  MDFE_CANCELLATION_JUSTIFICATION_MAX_LENGTH,
  MDFE_CANCELLATION_JUSTIFICATION_MIN_LENGTH,
} from './mdfeManifest.constant'
import type {
  MdfeDocumentBlock,
  MdfeManifestPreview,
  MdfeManifestStatus,
  MdfeManifestTotals,
} from './mdfeManifest.types'

const CITY_CODE_PATTERN = /^[0-9]{7}$/
const STATE_PATTERN = /^[A-Z]{2}$/

export type MdfeManifestActionAvailability = Readonly<{
  canCancel: boolean
  canClose: boolean
  canDiscard: boolean
  canIssue: boolean
}>

export type MdfeCancellationIssue = null | 'required' | 'tooLong' | 'tooShort'

export type MdfeClosureIssue = null | 'invalidCity' | 'invalidState'

export type MdfeManifestDraft = Readonly<{
  blocked: readonly MdfeDocumentBlock[]
  destinationState: string
  dischargeCityNames: readonly string[]
  documentIds: readonly string[]
  loadingCityNames: readonly string[]
  totals: MdfeManifestTotals
}>

const ISSUABLE_STATUSES: readonly MdfeManifestStatus[] = ['draft', 'rejected']

/** ADR-0017: só antes de a SEFAZ decidir — depois disso o caminho é o cancelamento, não o descarte. */
const DISCARDABLE_STATUSES: readonly MdfeManifestStatus[] = ['draft', 'rejected']

export function resolveManifestActions(status: string): MdfeManifestActionAvailability {
  const isAuthorized = status === 'authorized'
  return {
    canCancel: isAuthorized,
    canClose: isAuthorized,
    canDiscard: DISCARDABLE_STATUSES.some((discardable) => discardable === status),
    canIssue: ISSUABLE_STATUSES.some((issuable) => issuable === status),
  }
}

export function validateCancellationJustification(value: string): MdfeCancellationIssue {
  const justification = value.trim()
  if (justification.length === 0) return 'required'
  if (justification.length < MDFE_CANCELLATION_JUSTIFICATION_MIN_LENGTH) return 'tooShort'
  if (justification.length > MDFE_CANCELLATION_JUSTIFICATION_MAX_LENGTH) return 'tooLong'
  return null
}

export function validateClosure(
  input: Readonly<{ closureCityCode: string; closureState: string }>,
): MdfeClosureIssue {
  if (!CITY_CODE_PATTERN.test(input.closureCityCode)) return 'invalidCity'
  if (!STATE_PATTERN.test(input.closureState)) return 'invalidState'
  return null
}

export function createManifestDraftFromPreview(preview: MdfeManifestPreview): MdfeManifestDraft {
  return {
    blocked: preview.blocked,
    destinationState: preview.destinationState,
    dischargeCityNames: preview.dischargeCities.map((city) => city.cityName),
    documentIds: preview.documents.map((document) => document.fiscalDocumentId),
    loadingCityNames: preview.loadingCities.map((city) => city.cityName),
    totals: preview.totals,
  }
}
