/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T5.2: o formato REAL das respostas de `/holiday-imports/*` (apps/api-transportada,
 * `business-calendar/presentation/holiday-import.schema.ts`), com dados fictícios. `removedByProvider` é
 * `{ items, truncated }` e a lista de supressões chega paginada (`pagination`).
 */
import type {
  HolidayImportStatus,
  HolidayImportSuppression,
} from '@/modules/company-settings/shared/holidayImport.types'

export const SUPPRESSION_ID = '4f3a8c2e-1b7d-4e90-a5c6-7d2e9b1f0a31'
export const REMOVED_HOLIDAY_ID = '5e4b9d3f-2c8e-4fa1-b6d7-8e3f0c2a1b42'

export function buildImportStatus(
  overrides: Partial<HolidayImportStatus> = {},
): HolidayImportStatus {
  return {
    failures: [],
    isEnabled: true,
    lastFetchedAt: '2026-10-09T09:30:00.000Z',
    lastRun: { finishedAt: '2026-10-09T09:31:00.000Z', outcome: 'succeeded' },
    month: '2026-10-01',
    monthlyRequests: 42,
    pairs: {
      done: 8,
      failed: 0,
      notCovered: 0,
      pending: 2,
      planRestricted: 0,
      quotaExhausted: 0,
      total: 10,
    },
    removedByProvider: { items: [], truncated: false },
    totalCities: 5,
    ...overrides,
  }
}

export function buildSuppression(
  overrides: Partial<HolidayImportSuppression> = {},
): HolidayImportSuppression {
  return {
    holidayOn: '2026-11-20',
    ibgeCode: '3509502',
    id: SUPPRESSION_ID,
    scope: 'city',
    suppressedAt: '2026-10-08T14:00:00.000Z',
    ...overrides,
  }
}

/** O corpo `{ data, pagination }` que a API manda nas listas paginadas. */
export function pagedEnvelope(
  input: Readonly<{ data: unknown; page?: number; perPage?: number; total: number }>,
): { data: unknown; pagination: { page: number; perPage: number; total: number } } {
  return {
    data: input.data,
    pagination: { page: input.page ?? 1, perPage: input.perPage ?? 20, total: input.total },
  }
}
