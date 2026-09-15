/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** A transação que os dois trilhos de entrada da NF-e e a escrita de status compartilham. */
export type NfeWriteTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]
