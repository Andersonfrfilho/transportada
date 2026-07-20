/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { CompanyContext } from '../../src/identity/domain/tenant-context'

export const COMPANY_ID = '00000000-0000-4000-8000-000000000201'
export const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000202'
export const USER_ID = '00000000-0000-4000-8000-000000000203'
export const CORRELATION_ID = 'certificate-correlation-0001'
export const IDEMPOTENCY_KEY = 'certificate-replace-0001'
export const COMPANY_CNPJ = '61156864000191'
export const OTHER_COMPANY_CNPJ = '11222333000181'
export const CERTIFICATE_ID = '00000000-0000-4000-8000-000000000204'
export const NEXT_CERTIFICATE_ID = '00000000-0000-4000-8000-000000000205'
export const VALID_FROM = new Date('2026-01-01T00:00:00.000Z')
export const EXPIRES_AT = new Date('2027-01-01T00:00:00.000Z')
export const SECRET_TEXT = 'synthetic-pfx-and-password-sentinel'
export const TEXT_ENCODER = new TextEncoder()

export const COMPANY_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: '00000000-0000-4000-8000-000000000206',
  permissions: new Set(['settings.manage']),
  roles: ['company-admin'],
  userId: USER_ID,
}

export const SYNTHETIC_CERTIFICATE = TEXT_ENCODER.encode(`certificate:${SECRET_TEXT}`)
export const SYNTHETIC_PASSWORD = TEXT_ENCODER.encode(`password:${SECRET_TEXT}`)

export type ReplaceDigitalCertificateInput = {
  readonly certificate: Uint8Array
  readonly companyId?: string
  readonly context: CompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly password: Uint8Array
  readonly purpose: 'cte'
}

export type DigitalCertificateResult = {
  readonly expiresAt: Date
  readonly id: string
  readonly purpose: 'cte'
  readonly status: 'active'
  readonly validFrom: Date
  readonly version: bigint
}

export type PersistedCertificate = Omit<DigitalCertificateResult, 'status'> & {
  readonly companyId: string
  readonly fingerprint: string
  readonly secretEnvelope: SecretEnvelopeV1 | null
  readonly status: 'active' | 'retired'
  readonly validatedCnpj: string
}

export function createReplaceInput(
  overrides: Partial<ReplaceDigitalCertificateInput> = {},
): ReplaceDigitalCertificateInput {
  return {
    certificate: Uint8Array.from(SYNTHETIC_CERTIFICATE),
    context: COMPANY_CONTEXT,
    correlationId: CORRELATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    password: Uint8Array.from(SYNTHETIC_PASSWORD),
    purpose: 'cte',
    ...overrides,
  }
}

export function expectedResult(
  input: {
    readonly id?: string
    readonly version?: bigint
  } = {},
): DigitalCertificateResult {
  return {
    expiresAt: EXPIRES_AT,
    id: input.id ?? CERTIFICATE_ID,
    purpose: 'cte',
    status: 'active',
    validFrom: VALID_FROM,
    version: input.version ?? 1n,
  }
}

export function syntheticEnvelope(suffix = 'one'): SecretEnvelopeV1 {
  return {
    algorithm: 'A256GCM',
    ciphertext: `synthetic-ciphertext-${suffix}`,
    keyId: 'local-v1',
    nonce: `synthetic-nonce-${suffix}`,
    version: 1,
  }
}
