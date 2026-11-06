/* Copyright (c) 2026 Ada Technology. MIT License. */
export const LOOKUP_STATUSES = [
  'queued',
  'querying',
  'waiting',
  'imported',
  'refused',
  'failed',
] as const
export type LookupStatus = (typeof LOOKUP_STATUSES)[number]

export const LOOKUP_REASONS = [
  'not_interested',
  'summary_only',
  'not_found',
  'expired',
  'cancelled',
  'denied',
  'certificate_mismatch',
  'invalid_key',
  'sefaz_unavailable',
] as const
export type LookupReason = (typeof LOOKUP_REASONS)[number]

export const LOOKUP_POLL_INTERVAL_MS = 3_000
export const LOOKUP_POLL_MAX_DURATION_MS = 10 * 60 * 1_000
export const CHECK_BATCH_WINDOW_MS = 500
export const CHECK_BATCH_MAX_KEYS = 200

export const REQUEST_FAILED_CODE = 'NFE_ACCESS_KEY_LOOKUP_REQUEST_FAILED'
export const RESPONSE_INVALID_CODE = 'NFE_ACCESS_KEY_LOOKUP_RESPONSE_INVALID'
