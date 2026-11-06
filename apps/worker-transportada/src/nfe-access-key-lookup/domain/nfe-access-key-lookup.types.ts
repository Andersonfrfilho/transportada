/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DfeItem } from '@adatechnology/fiscal-provider'

import type { NfeAccessKeyLookupReason } from '../../database/nfe.schema.js'

export type AccessKeyLookupGatewayResult =
  | { readonly kind: 'document'; readonly item: DfeItem }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'sefaz-rejection'; readonly cStat: string }
  | { readonly kind: 'unavailable' }

export type AccessKeyLookupOutcome =
  | { readonly status: 'imported-candidate' }
  | { readonly status: 'refused'; readonly reason: NfeAccessKeyLookupReason }
  | {
      readonly status: 'failed'
      readonly reason: 'sefaz_unavailable'
      readonly cStat?: string
      readonly unmapped?: true
    }
  | { readonly status: 'waiting' }
