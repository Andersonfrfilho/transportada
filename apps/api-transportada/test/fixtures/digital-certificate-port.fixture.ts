/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { DigitalCertificateResult } from './digital-certificate-application.fixture'

export type FingerprintInput = {
  readonly fields: readonly Uint8Array[]
  readonly operation: string
}

export type IdempotencyFingerprintPort = {
  create(input: FingerprintInput): Promise<string>
}

export type DigitalCertificateSecretService = {
  readonly decrypt: (input: {
    readonly certificateId: string
    readonly companyId: string
    readonly envelope: SecretEnvelopeV1
    readonly purpose: 'cte'
  }) => Promise<{ readonly certificateBase64: string; readonly password: string }>
  readonly encrypt: (input: {
    readonly certificateBase64: string
    readonly certificateId: string
    readonly companyId: string
    readonly password: string
    readonly purpose: 'cte'
  }) => Promise<SecretEnvelopeV1>
}

export type DigitalCertificateAuditRecord = {
  readonly action: string
  readonly actorUserId: string
  readonly afterSnapshot: Readonly<Record<string, string>>
  readonly beforeSnapshot: Readonly<Record<string, string>> | null
  readonly companyId: string
  readonly correlationId: string
  readonly entityId: string
  readonly entityType: string
}

export type DigitalCertificateIdempotencyRecord = {
  readonly companyId: string
  readonly fingerprint: string
  readonly idempotencyKey: string
  readonly operation: string
  readonly response: DigitalCertificateResult
}

export type RotateDigitalCertificateInput = {
  readonly certificateId: string
  readonly companyId: string
  readonly createdByUserId: string
  readonly expiresAt: Date
  readonly fingerprint: string
  readonly purpose: 'cte'
  readonly secretEnvelope: SecretEnvelopeV1
  readonly validatedCnpj: string
  readonly validFrom: Date
}

export type DigitalCertificateRotation = {
  readonly previous: DigitalCertificateResult | null
  readonly result: DigitalCertificateResult
}

type IdempotencyLookup = {
  readonly companyId: string
  readonly idempotencyKey: string
  readonly operation: string
}

export type DigitalCertificateTransactionPort = {
  appendAudit(record: DigitalCertificateAuditRecord): Promise<void>
  findIdempotency(input: IdempotencyLookup): Promise<DigitalCertificateIdempotencyRecord | null>
  lockCompanyProfile(input: {
    readonly companyId: string
  }): Promise<{ readonly cnpj: string } | null>
  replaceCertificate(input: RotateDigitalCertificateInput): Promise<DigitalCertificateRotation>
  saveIdempotency(record: DigitalCertificateIdempotencyRecord): Promise<void>
}

export type DigitalCertificateRepositoryPort = {
  execute<TResult>(
    operation: (transaction: DigitalCertificateTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
  findCompanyProfile(input: {
    readonly companyId: string
  }): Promise<{ readonly cnpj: string } | null>
  findIdempotency(input: IdempotencyLookup): Promise<DigitalCertificateIdempotencyRecord | null>
}
