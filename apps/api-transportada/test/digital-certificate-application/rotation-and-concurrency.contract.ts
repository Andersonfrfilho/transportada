/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CERTIFICATE_ID,
  COMPANY_ID,
  CORRELATION_ID,
  EXPIRES_AT,
  NEXT_CERTIFICATE_ID,
  USER_ID,
  VALID_FROM,
  createReplaceInput,
} from '../fixtures/digital-certificate-application.fixture'
import { createSecretServiceFixture } from '../fixtures/digital-certificate-dependencies.fixture'
import { DigitalCertificateRepositoryFixture } from '../fixtures/digital-certificate-repository.fixture'
import { createReplaceUseCaseFixture } from '../fixtures/digital-certificate-use-case.fixture'

describe('digital certificate atomic rotation contract', () => {
  test('encrypts before the transaction and persists exact safe allowlists', async () => {
    const repository = new DigitalCertificateRepositoryFixture()
    const secrets = createSecretServiceFixture({
      onEncrypt() {
        expect(repository.lockCompanyIds).toEqual([])
      },
    })
    const fixture = await createReplaceUseCaseFixture({
      repository,
      secretService: secrets.port,
    })

    const result = await fixture.useCase.execute(createReplaceInput())

    expect(Object.keys(result).sort()).toEqual([
      'expiresAt',
      'id',
      'purpose',
      'status',
      'validFrom',
      'version',
    ])
    expect(repository.audits).toEqual([expectedAudit()])
    expect(Object.keys(repository.idempotencyRecords[0] ?? {}).sort()).toEqual([
      'companyId',
      'fingerprint',
      'idempotencyKey',
      'operation',
      'response',
    ])
    expect(Object.keys(repository.idempotencyRecords[0]?.response ?? {}).sort()).toEqual(
      Object.keys(result).sort(),
    )
  })

  test('retires the previous envelope and activates one monotonic version', async () => {
    const repository = new DigitalCertificateRepositoryFixture()
    repository.seedActive()
    const fixture = await createReplaceUseCaseFixture({ repository })

    const result = await fixture.useCase.execute(createReplaceInput())

    expect(result.version).toBe(2n)
    expect(repository.certificates.map(({ status, version }) => ({ status, version }))).toEqual([
      { status: 'retired', version: 1n },
      { status: 'active', version: 2n },
    ])
    expect(repository.certificates[0]?.secretEnvelope).toBeNull()
    expect(repository.certificates[1]?.secretEnvelope).not.toBeNull()
  })

  test('serializes concurrent replacements into one active monotonic history', async () => {
    const repository = new DigitalCertificateRepositoryFixture()
    const fixture = await createReplaceUseCaseFixture({ repository })
    const firstInput = createReplaceInput({ idempotencyKey: 'certificate-concurrent-0001' })
    const secondInput = createReplaceInput({ idempotencyKey: 'certificate-concurrent-0002' })

    const results = await Promise.all([
      fixture.useCase.execute(firstInput),
      fixture.useCase.execute(secondInput),
    ])

    expect(results.map(({ version }) => version).sort()).toEqual([1n, 2n])
    expect(repository.certificates.filter(({ status }) => status === 'active')).toHaveLength(1)
    expect(repository.certificates.filter(({ status }) => status === 'retired')).toHaveLength(1)
    expect(
      repository.certificates.find(({ status }) => status === 'retired')?.secretEnvelope,
    ).toBeNull()
    expect(repository.certificates.map(({ id }) => id).sort()).toEqual(
      [CERTIFICATE_ID, NEXT_CERTIFICATE_ID].sort(),
    )
    expect(repository.audits).toHaveLength(2)
  })
})

function expectedAudit() {
  return {
    action: 'digital-certificate.replaced',
    actorUserId: USER_ID,
    afterSnapshot: {
      expiresAt: EXPIRES_AT.toISOString(),
      purpose: 'cte',
      status: 'active',
      validFrom: VALID_FROM.toISOString(),
      version: '1',
    },
    beforeSnapshot: null,
    companyId: COMPANY_ID,
    correlationId: CORRELATION_ID,
    entityId: CERTIFICATE_ID,
    entityType: 'digital-certificate',
  }
}
