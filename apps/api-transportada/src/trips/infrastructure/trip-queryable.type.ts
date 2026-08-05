/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

export type TripDatabase = ReturnType<typeof createDrizzleProvider>['db']
export type TripTransaction = Parameters<Parameters<TripDatabase['transaction']>[0]>[0]
export type TripQueryable = TripDatabase | TripTransaction
