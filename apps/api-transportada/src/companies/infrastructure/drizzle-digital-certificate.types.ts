/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

export type DigitalCertificateDatabase = ReturnType<typeof createDrizzleProvider>['db']
export type DigitalCertificateTransaction = Parameters<
  Parameters<DigitalCertificateDatabase['transaction']>[0]
>[0]
export type DigitalCertificateQueryable = DigitalCertificateDatabase | DigitalCertificateTransaction
