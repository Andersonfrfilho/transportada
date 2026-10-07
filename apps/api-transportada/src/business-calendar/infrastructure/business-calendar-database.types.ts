/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

export type BusinessCalendarDatabase = ReturnType<typeof createDrizzleProvider>['db']
export type BusinessCalendarTransaction = Parameters<
  Parameters<BusinessCalendarDatabase['transaction']>[0]
>[0]
