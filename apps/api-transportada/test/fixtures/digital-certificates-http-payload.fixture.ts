/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CertificateCursor, CertificateMetadata } from './digital-certificates-http.types'

export const CERTIFICATE_ID = '00000000-0000-4000-8000-000000000301'
export const RETIRED_CERTIFICATE_ID = '00000000-0000-4000-8000-000000000302'
export const CREATED_AT = new Date('2026-07-20T10:00:00.000Z')
export const VALID_FROM = new Date('2026-01-01T00:00:00.000Z')
export const EXPIRES_AT = new Date('2027-01-01T00:00:00.000Z')
export const SYNTHETIC_CERTIFICATE = new TextEncoder().encode('synthetic-certificate-bytes')
export const SYNTHETIC_PASSWORD = new TextEncoder().encode('synthetic-password')
export const VALID_IDEMPOTENCY_KEY = 'certificate-http-0001'

export const ACTIVE_CERTIFICATE: CertificateMetadata = {
  createdAt: CREATED_AT,
  expiresAt: EXPIRES_AT,
  id: CERTIFICATE_ID,
  purpose: 'cte',
  status: 'active',
  validFrom: VALID_FROM,
  version: 2n,
}

export const RETIRED_CERTIFICATE: CertificateMetadata = {
  createdAt: new Date('2026-07-19T10:00:00.000Z'),
  expiresAt: EXPIRES_AT,
  id: RETIRED_CERTIFICATE_ID,
  purpose: 'cte',
  status: 'retired',
  validFrom: VALID_FROM,
  version: 1n,
}

export const NEXT_CURSOR: CertificateCursor = {
  createdAt: RETIRED_CERTIFICATE.createdAt,
  id: RETIRED_CERTIFICATE.id,
}

export function encodeCursor(cursor: CertificateCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt.toISOString(), cursor.id])).toString(
    'base64url',
  )
}

export function expectedMetadata(metadata: CertificateMetadata): object {
  return {
    expiresAt: metadata.expiresAt.toISOString(),
    id: metadata.id,
    purpose: metadata.purpose,
    status: metadata.status,
    validFrom: metadata.validFrom.toISOString(),
    version: metadata.version.toString(),
  }
}
