/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CertificateValidationGateway } from '../../src/companies/application/certificate-validation.port'
import type {
  DigitalCertificateSecretService,
  IdempotencyFingerprintPort,
} from './digital-certificate-port.fixture'
import {
  COMPANY_CNPJ,
  EXPIRES_AT,
  syntheticEnvelope,
  VALID_FROM,
} from './digital-certificate-application.fixture'

export function createValidationFixture(
  overrides: Partial<ReturnType<CertificateValidationGateway['validate']>> = {},
): {
  readonly inputs: Parameters<CertificateValidationGateway['validate']>[0][]
  readonly port: CertificateValidationGateway
} {
  const inputs: Parameters<CertificateValidationGateway['validate']>[0][] = []
  return {
    inputs,
    port: {
      validate(input) {
        inputs.push(structuredClone(input))
        return {
          certificateCnpj: COMPANY_CNPJ,
          expiresAt: EXPIRES_AT,
          rejectionCodes: [],
          valid: true,
          validFrom: VALID_FROM,
          ...overrides,
        }
      },
    },
  }
}

export function createSecretServiceFixture(
  input: {
    readonly onEncrypt?: (
      secretInput: Parameters<DigitalCertificateSecretService['encrypt']>[0],
    ) => void
  } = {},
): {
  readonly decryptInputs: Parameters<DigitalCertificateSecretService['decrypt']>[0][]
  readonly encryptInputs: Parameters<DigitalCertificateSecretService['encrypt']>[0][]
  readonly port: DigitalCertificateSecretService
  decryptError: Error | undefined
  encryptError: Error | undefined
} {
  const fixture = {
    decryptInputs: [] as Parameters<DigitalCertificateSecretService['decrypt']>[0][],
    encryptInputs: [] as Parameters<DigitalCertificateSecretService['encrypt']>[0][],
    port: undefined as unknown as DigitalCertificateSecretService,
    decryptError: undefined,
    encryptError: undefined,
  }
  fixture.port = {
    async decrypt(input) {
      fixture.decryptInputs.push(structuredClone(input))
      if (fixture.decryptError) throw fixture.decryptError
      return {
        certificateBase64: 'c3ludGhldGlj',
        password: 'synthetic-password',
      }
    },
    async encrypt(secretInput) {
      input.onEncrypt?.(secretInput)
      fixture.encryptInputs.push(structuredClone(secretInput))
      if (fixture.encryptError) throw fixture.encryptError
      return syntheticEnvelope(String(fixture.encryptInputs.length))
    },
  }
  return fixture
}

export function createFingerprintFixture(): {
  readonly inputs: Parameters<IdempotencyFingerprintPort['create']>[0][]
  readonly port: IdempotencyFingerprintPort
} {
  const inputs: Parameters<IdempotencyFingerprintPort['create']>[0][] = []
  return {
    inputs,
    port: {
      async create(input) {
        inputs.push(structuredClone(input))
        const values = input.fields.map((field) => Buffer.from(field).toString('base64url'))
        const bytes = new TextEncoder().encode(JSON.stringify([input.operation, ...values]))
        return Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('base64url')
      },
    },
  }
}
