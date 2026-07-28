/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq, inArray, type SQL } from 'drizzle-orm'

import { fiscalSequenceReservations } from '../../database/fiscal-sequence.schema.js'
import {
  mdfeFiscalDocuments,
  mdfeIssuanceAttempts,
  mdfeManifests,
  type MdfeAttemptKind,
  type MdfeIssuanceStatus,
} from '../../database/mdfe.schema.js'

/** Uma tentativa nesses estados ainda pode virar evento na SEFAZ. */
export const OPEN_ATTEMPT_STATUSES: readonly MdfeIssuanceStatus[] = [
  'pending',
  'in_flight',
  'retry_scheduled',
]

type CompanyScope = { readonly companyId: string }
type ManifestScope = CompanyScope & { readonly manifestId: string }

export function buildIssuanceStateFilters({
  companyId,
  manifestId,
}: ManifestScope): readonly SQL[] {
  return [eq(mdfeManifests.companyId, companyId), eq(mdfeManifests.id, manifestId)]
}

export function buildAttemptIdempotencyFilters({
  companyId,
  idempotencyKey,
}: CompanyScope & { readonly idempotencyKey: string }): readonly SQL[] {
  return [
    eq(mdfeIssuanceAttempts.companyId, companyId),
    eq(mdfeIssuanceAttempts.idempotencyKey, idempotencyKey),
  ]
}

export function buildOpenAttemptFilters({
  attemptKind,
  companyId,
  manifestId,
}: ManifestScope & { readonly attemptKind: MdfeAttemptKind }): readonly SQL[] {
  return [
    eq(mdfeIssuanceAttempts.companyId, companyId),
    eq(mdfeIssuanceAttempts.manifestId, manifestId),
    eq(mdfeIssuanceAttempts.attemptKind, attemptKind),
    inArray(mdfeIssuanceAttempts.status, [...OPEN_ATTEMPT_STATUSES]),
  ]
}

export function buildFiscalDocumentFilters({
  companyId,
  manifestId,
}: ManifestScope): readonly SQL[] {
  return [
    eq(mdfeFiscalDocuments.companyId, companyId),
    eq(mdfeFiscalDocuments.manifestId, manifestId),
  ]
}

export function buildReservationFilters({
  companyId,
  reservationKey,
}: CompanyScope & { readonly reservationKey: string }): readonly SQL[] {
  return [
    eq(fiscalSequenceReservations.companyId, companyId),
    eq(fiscalSequenceReservations.reservationKey, reservationKey),
  ]
}
