/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeAccessKeyLookupStatus } from '../../database/nfe.schema.js'

export const ACTIVE_LOOKUP_STATUSES: readonly NfeAccessKeyLookupStatus[] = [
  'queued',
  'querying',
  'waiting',
]

export const SEFAZ_UNAVAILABLE_REASON = 'sefaz_unavailable' as const
export const NFE_ACCESS_KEY_LOOKUP_FINISHED_LOG = 'nfe_access_key_lookup_finished'
export const MAX_LOGGED_ERROR_MESSAGE_LENGTH = 200
