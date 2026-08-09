/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDraft } from '../hooks/useTripCreation.hook'

export type TripFormIssue = 'driverRequired' | 'vehicleRequired'

export function validateTripForm(draft: TripDraft): readonly TripFormIssue[] {
  const issues: TripFormIssue[] = []
  if (draft.vehicleId === '') issues.push('vehicleRequired')
  if (draft.driverIds.length === 0) issues.push('driverRequired')
  return issues
}

export type TripDocumentLinkMode = 'freight' | 'nfe'
export type TripDocumentLinkDraft = Readonly<{ mode: TripDocumentLinkMode; value: string }>

export function buildLinkTripDocumentBody(
  draft: TripDocumentLinkDraft,
): Readonly<{ freightCalculationId: null | string; nfeDocumentId: null | string }> {
  return {
    freightCalculationId: draft.mode === 'freight' ? draft.value : null,
    nfeDocumentId: draft.mode === 'nfe' ? draft.value : null,
  }
}
