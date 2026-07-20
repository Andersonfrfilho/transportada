/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import type { DigitalCertificateResult } from '../application/digital-certificate.port.js'

const persistedCertificateResponseSchema = z
  .object({
    expiresAt: z.iso.datetime({ offset: true }),
    id: z.uuid(),
    purpose: z.literal('cte'),
    status: z.literal('active'),
    validFrom: z.iso.datetime({ offset: true }),
    version: z.string().regex(/^[1-9][0-9]*$/),
  })
  .strict()

export function serializeDigitalCertificateResponse(
  response: DigitalCertificateResult,
): z.input<typeof persistedCertificateResponseSchema> {
  return {
    expiresAt: response.expiresAt.toISOString(),
    id: response.id,
    purpose: response.purpose,
    status: response.status,
    validFrom: response.validFrom.toISOString(),
    version: response.version.toString(),
  }
}

export function deserializeDigitalCertificateResponse(response: unknown): DigitalCertificateResult {
  const parsed = persistedCertificateResponseSchema.parse(response)
  return {
    expiresAt: new Date(parsed.expiresAt),
    id: parsed.id,
    purpose: parsed.purpose,
    status: parsed.status,
    validFrom: new Date(parsed.validFrom),
    version: BigInt(parsed.version),
  }
}
