/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DistributionEnqueueIdentifiers } from '../application/enqueue-distribution.port.js'

/** Os UUIDs entram por porta para o teste de contrato poder fixá-los sem tocar no relógio. */
export function createCryptoDistributionIdentifiers(): DistributionEnqueueIdentifiers {
  return {
    nextEventId: () => crypto.randomUUID(),
    nextImportId: () => crypto.randomUUID(),
  }
}
