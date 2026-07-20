/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { DigitalCertificateIdempotencyConflictError } from '../domain/digital-certificate.error.js'
import type {
  DigitalCertificateIdempotencyLookup,
  DigitalCertificateIdempotencyRecord,
  DigitalCertificateResult,
} from './digital-certificate.port.js'

type DigitalCertificateIdempotencyReader = {
  findIdempotency(
    input: DigitalCertificateIdempotencyLookup,
  ): Promise<DigitalCertificateIdempotencyRecord | null>
}

export async function resolveDigitalCertificateReplay(input: {
  readonly fingerprint: string
  readonly lookup: DigitalCertificateIdempotencyLookup
  readonly repository: DigitalCertificateIdempotencyReader
}): Promise<DigitalCertificateResult | null> {
  const record = await input.repository.findIdempotency(input.lookup)
  if (record === null) return null
  if (record.fingerprint !== input.fingerprint) {
    throw new DigitalCertificateIdempotencyConflictError()
  }
  return record.response
}
