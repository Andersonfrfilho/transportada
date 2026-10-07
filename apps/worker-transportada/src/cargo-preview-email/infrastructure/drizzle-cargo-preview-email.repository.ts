/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { CargoPreviewEmailRepositoryPort } from '../application/cargo-preview-email.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleCargoPreviewEmailRepository(
  database: Database,
): CargoPreviewEmailRepositoryPort {
  void database
  throw new Error('not implemented')
}
