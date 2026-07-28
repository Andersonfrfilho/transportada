/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

export type MdfeDatabase = ReturnType<typeof createDrizzleProvider>['db']
export type MdfeTransaction = Parameters<Parameters<MdfeDatabase['transaction']>[0]>[0]
export type MdfeQueryable = MdfeDatabase | MdfeTransaction
