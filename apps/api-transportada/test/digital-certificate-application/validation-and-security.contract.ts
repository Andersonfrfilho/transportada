/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CertificateValidationGateway,
  CertificateValidationOutcome,
} from '../../src/companies/application/certificate-validation.port'
import {
  COMPANY_CNPJ,
  COMPANY_ID,
  EXPIRES_AT,
  OTHER_COMPANY_CNPJ,
  OTHER_COMPANY_ID,
  SECRET_TEXT,
  VALID_FROM,
  createReplaceInput,
} from '../fixtures/digital-certificate-application.fixture'
import { DigitalCertificateRepositoryFixture } from '../fixtures/digital-certificate-repository.fixture'
import {
  captureApiError,
  createReplaceUseCaseFixture,
} from '../fixtures/digital-certificate-use-case.fixture'

const REJECTIONS = [
  ['invalid PFX or password', { rejectionCodes: ['CERTIFICATE_INVALID'], valid: false }],
  ['expired certificate', { rejectionCodes: ['CERTIFICATE_EXPIRED'], valid: false }],
  [
    'certificate CNPJ from another tenant',
    {
      certificateCnpj: OTHER_COMPANY_CNPJ,
      expiresAt: EXPIRES_AT,
      rejectionCodes: [],
      valid: true,
      validFrom: VALID_FROM,
    },
  ],
] satisfies readonly (readonly [string, CertificateValidationOutcome])[]

describe('digital certificate validation and tenant security contract', () => {
  test.each(REJECTIONS)(
    'rejects %s and preserves the active credential',
    async (_name, outcome) => {
      const repository = new DigitalCertificateRepositoryFixture()
      repository.seedActive()
      const gateway = validationGateway(outcome)
      const fixture = await createReplaceUseCaseFixture({
        certificateValidationGateway: gateway,
        repository,
      })
      const input = createReplaceInput()

      const error = await captureApiError(() => fixture.useCase.execute(input))

      expectRejectedWithoutEnumeration(error)
      expect(repository.certificates).toHaveLength(1)
      expect(repository.certificates[0]?.status).toBe('active')
      expect(fixture.secrets.encryptInputs).toEqual([])
      expect(repository.audits).toEqual([])
      expectCleared(input.certificate, input.password)
    },
  )

  test('derives CNPJ and all scopes from the authenticated company profile', async () => {
    const fixture = await createReplaceUseCaseFixture()
    const input = createReplaceInput({ companyId: OTHER_COMPANY_ID })

    await fixture.useCase.execute(input)

    expect(fixture.repository.lookupCompanyIds).toEqual([COMPANY_ID])
    expect(fixture.repository.lockCompanyIds).toEqual([COMPANY_ID])
    expect(fixture.repository.replaceInputs[0]?.companyId).toBe(COMPANY_ID)
    expect(fixture.repository.replaceInputs[0]?.validatedCnpj).toBe(COMPANY_CNPJ)
    expect(fixture.secrets.encryptInputs[0]).toMatchObject({ companyId: COMPANY_ID })
  })

  test('fails closed with a stable safe error when the validator throws', async () => {
    const repository = new DigitalCertificateRepositoryFixture()
    repository.seedActive()
    const fixture = await createReplaceUseCaseFixture({
      certificateValidationGateway: {
        validate() {
          throw new Error(`provider diagnostic ${SECRET_TEXT}`)
        },
      },
      repository,
    })
    const input = createReplaceInput()

    const error = await captureApiError(() => fixture.useCase.execute(input))

    expect(error).toMatchObject({
      code: 'DIGITAL_CERTIFICATE_OPERATION_FAILED',
      message: 'Digital certificate operation failed',
      status: 500,
    })
    expectSafeError(error)
    expect(repository.certificates[0]?.status).toBe('active')
    expectCleared(input.certificate, input.password)
  })
})

function validationGateway(
  outcome: ReturnType<CertificateValidationGateway['validate']>,
): CertificateValidationGateway {
  return { validate: () => outcome }
}

function expectRejectedWithoutEnumeration(error: Error): void {
  expect(error).toMatchObject({
    code: 'DIGITAL_CERTIFICATE_REJECTED',
    message: 'Digital certificate was rejected',
    status: 400,
  })
  expectSafeError(error)
}

function expectSafeError(error: Error): void {
  expect(Object.keys(error).sort()).toEqual(['code', 'headers', 'name', 'status'])
  for (const sensitive of [
    COMPANY_ID,
    OTHER_COMPANY_ID,
    COMPANY_CNPJ,
    OTHER_COMPANY_CNPJ,
    SECRET_TEXT,
  ]) {
    expect(String(error)).not.toContain(sensitive)
    expect(JSON.stringify(error)).not.toContain(sensitive)
  }
}

function expectCleared(...buffers: readonly Uint8Array[]): void {
  for (const buffer of buffers) expect([...buffer]).toEqual(new Array(buffer.byteLength).fill(0))
}
