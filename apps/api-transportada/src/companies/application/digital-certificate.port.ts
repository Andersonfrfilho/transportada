/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { CertificatePurpose } from '../../database/digital-certificate.schema.js'

export type DigitalCertificateResult = {
  readonly expiresAt: Date
  readonly id: string
  readonly purpose: CertificatePurpose
  readonly status: 'active'
  readonly validFrom: Date
  readonly version: bigint
}

export type DigitalCertificateMetadata = Omit<DigitalCertificateResult, 'status'> & {
  readonly createdAt: Date
  readonly status: 'active' | 'retired'
}

export type DigitalCertificateCursor = {
  readonly createdAt: Date
  readonly id: string
}

export type DigitalCertificateSecret = {
  readonly certificateBase64: string
  readonly password: string
}

export type DigitalCertificateSecretService = {
  readonly decrypt: (input: {
    readonly certificateId: string
    readonly companyId: string
    readonly envelope: SecretEnvelopeV1
    readonly purpose: CertificatePurpose
  }) => Promise<DigitalCertificateSecret>
  readonly encrypt: (input: {
    readonly certificateBase64: string
    readonly certificateId: string
    readonly companyId: string
    readonly password: string
    readonly purpose: CertificatePurpose
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
  readonly purpose: CertificatePurpose
  readonly secretEnvelope: SecretEnvelopeV1
  readonly validatedCnpj: string
  readonly validFrom: Date
}

export type DigitalCertificateRotation = {
  readonly previous: DigitalCertificateResult | null
  readonly result: DigitalCertificateResult
}

export type DigitalCertificateIdempotencyLookup = {
  readonly companyId: string
  readonly idempotencyKey: string
  readonly operation: string
}

export type DigitalCertificateTransactionPort = {
  appendAudit(record: DigitalCertificateAuditRecord): Promise<void>
  findIdempotency(
    input: DigitalCertificateIdempotencyLookup,
  ): Promise<DigitalCertificateIdempotencyRecord | null>
  lockCompanyProfile(input: {
    readonly companyId: string
  }): Promise<{ readonly cnpj: string } | null>
  replaceCertificate(input: RotateDigitalCertificateInput): Promise<DigitalCertificateRotation>
  retireActiveCertificate(input: {
    readonly companyId: string
    readonly purpose: CertificatePurpose
  }): Promise<DigitalCertificateMetadata | null>
  saveIdempotency(record: DigitalCertificateIdempotencyRecord): Promise<void>
}

export type DigitalCertificateRepositoryPort = {
  execute<TResult>(
    operation: (transaction: DigitalCertificateTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
  findCompanyProfile(input: {
    readonly companyId: string
  }): Promise<{ readonly cnpj: string } | null>
  findIdempotency(
    input: DigitalCertificateIdempotencyLookup,
  ): Promise<DigitalCertificateIdempotencyRecord | null>
}

export type DigitalCertificateListingRepositoryPort = {
  list(input: {
    readonly companyId: string
    readonly cursor?: DigitalCertificateCursor
    readonly limit: number
  }): Promise<{
    readonly items: readonly DigitalCertificateMetadata[]
    readonly nextCursor?: DigitalCertificateCursor
  }>
}
