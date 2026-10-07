/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { ApplyCargoPreviewRetentionBatch } from '../application/cargo-preview-retention.port.js'
import type { DeleteStoredObjectBytes } from '../application/cargo-preview-retention-unit.port.js'

export type CargoPreviewRetentionDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleApplyCargoPreviewRetentionBatch(input: {
  readonly database: CargoPreviewRetentionDatabase
  readonly deleteObject: DeleteStoredObjectBytes
}): ApplyCargoPreviewRetentionBatch {
  void input
  return async () => ({
    deferredPreviewIds: [],
    failed: 0,
    partial: 0,
    processed: 0,
    retained: 0,
    skipped: 0,
  })
}
