/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { SecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import type { CertificateValidationGateway } from '../../src/companies/application/certificate-validation.port'
import type {
  DigitalCertificateRepositoryPort,
  DigitalCertificateSecretService,
  IdempotencyFingerprintPort,
} from './digital-certificate-port.fixture'
import { ApiError } from '../../src/shared/api.error'
import {
  CERTIFICATE_ID,
  NEXT_CERTIFICATE_ID,
  type DigitalCertificateResult,
  type ReplaceDigitalCertificateInput,
} from './digital-certificate-application.fixture'
import {
  createFingerprintFixture,
  createSecretServiceFixture,
  createValidationFixture,
} from './digital-certificate-dependencies.fixture'
import { DigitalCertificateRepositoryFixture } from './digital-certificate-repository.fixture'

type ReplaceDigitalCertificateUseCase = {
  readonly execute: (input: ReplaceDigitalCertificateInput) => Promise<DigitalCertificateResult>
}

type UseCaseDependencies = {
  readonly certificateValidationGateway: CertificateValidationGateway
  readonly createCertificateId: () => string
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly repository: DigitalCertificateRepositoryPort
  readonly secretService: DigitalCertificateSecretService
}

type FixtureOverrides = Partial<UseCaseDependencies> & {
  readonly repository?: DigitalCertificateRepositoryFixture
}

export async function createReplaceUseCaseFixture(overrides: FixtureOverrides = {}): Promise<{
  readonly fingerprint: ReturnType<typeof createFingerprintFixture>
  readonly repository: DigitalCertificateRepositoryFixture
  readonly secrets: ReturnType<typeof createSecretServiceFixture>
  readonly useCase: ReplaceDigitalCertificateUseCase
  readonly validation: ReturnType<typeof createValidationFixture>
}> {
  const fingerprint = createFingerprintFixture()
  const repository = overrides.repository ?? new DigitalCertificateRepositoryFixture()
  const secrets = createSecretServiceFixture()
  const validation = createValidationFixture()
  const ids = [CERTIFICATE_ID, NEXT_CERTIFICATE_ID]
  const module = (await import(
    '../../src/companies/application/replace-digital-certificate.use-case.js'
  )) as {
    readonly createReplaceDigitalCertificateUseCase: (
      input: UseCaseDependencies,
    ) => ReplaceDigitalCertificateUseCase
  }
  const useCase = module.createReplaceDigitalCertificateUseCase({
    certificateValidationGateway: overrides.certificateValidationGateway ?? validation.port,
    createCertificateId:
      overrides.createCertificateId ?? (() => ids.shift() ?? crypto.randomUUID()),
    fingerprintService: overrides.fingerprintService ?? fingerprint.port,
    repository: overrides.repository ?? repository,
    secretService: overrides.secretService ?? secrets.port,
  })
  return { fingerprint, repository, secrets, useCase, validation }
}

export async function createSecretService(
  envelopeProvider: SecretEnvelopeProvider,
): Promise<DigitalCertificateSecretService> {
  const module = (await import(
    '../../src/companies/application/digital-certificate-secret.service.js'
  )) as {
    readonly createDigitalCertificateSecretService: (input: {
      readonly envelopeProvider: SecretEnvelopeProvider
    }) => DigitalCertificateSecretService
  }
  return module.createDigitalCertificateSecretService({ envelopeProvider })
}

export async function captureApiError(operation: () => Promise<unknown>): Promise<ApiError> {
  try {
    await operation()
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('Expected operation to fail')
}
