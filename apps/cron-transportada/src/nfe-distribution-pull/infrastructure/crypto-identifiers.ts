/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DistributionEnqueueIdentifiers } from '../application/enqueue-distribution.use-case.js'

export function createCryptoIdentifiers(): DistributionEnqueueIdentifiers {
  return {
    nextImportId: () => crypto.randomUUID(),
    nextEventId: () => crypto.randomUUID(),
  }
}
