/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

export type CompanySettingsDatabase = ReturnType<typeof createDrizzleProvider>['db']
export type CompanySettingsTransaction = Parameters<
  Parameters<CompanySettingsDatabase['transaction']>[0]
>[0]
export type CompanySettingsQueryable = CompanySettingsDatabase | CompanySettingsTransaction
