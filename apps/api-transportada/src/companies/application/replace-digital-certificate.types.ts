/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { CertificatePurpose } from '../../database/digital-certificate.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { CertificateValidationGateway } from './certificate-validation.port.js'
import type {
  DigitalCertificateRepositoryPort,
  DigitalCertificateResult,
  DigitalCertificateSecretService,
} from './digital-certificate.port.js'
import type { IdempotencyFingerprintPort } from './company-settings.port.js'

export type ReplaceDigitalCertificateInput = {
  readonly certificate: Uint8Array
  readonly context: CompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly password: Uint8Array
  readonly purpose: CertificatePurpose
}

export type ReplaceDigitalCertificateDependencies = {
  readonly certificateValidationGateway: CertificateValidationGateway
  readonly createCertificateId: () => string
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly repository: DigitalCertificateRepositoryPort
  readonly secretService: DigitalCertificateSecretService
}

export type ValidatedCertificate = {
  readonly certificateId: string
  readonly companyId: string
  readonly expiresAt: Date
  readonly fingerprint: string
  readonly secretEnvelope: SecretEnvelopeV1
  readonly validatedCnpj: string
  readonly validFrom: Date
}

export type ReplaceDigitalCertificateUseCase = {
  readonly execute: (input: ReplaceDigitalCertificateInput) => Promise<DigitalCertificateResult>
  readonly executeWithOutcome: (input: ReplaceDigitalCertificateInput) => Promise<{
    readonly certificate: DigitalCertificateResult
    readonly replayed: boolean
  }>
}
