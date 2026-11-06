/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeAccessKeyLookupStatus } from '../../database/nfe.schema.js'

export const ACTIVE_LOOKUP_STATUSES: readonly NfeAccessKeyLookupStatus[] = [
  'queued',
  'querying',
  'waiting',
]
