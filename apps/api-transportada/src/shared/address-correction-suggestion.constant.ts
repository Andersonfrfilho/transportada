/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const ADDRESS_CORRECTION_SUGGESTION_STATUSES = ['pending', 'applied', 'dismissed'] as const
export type AddressCorrectionSuggestionStatus =
  (typeof ADDRESS_CORRECTION_SUGGESTION_STATUSES)[number]
