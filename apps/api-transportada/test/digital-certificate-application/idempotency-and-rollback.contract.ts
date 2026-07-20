/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CertificateValidationGateway } from '../../src/companies/application/certificate-validation.port'
import { createIdempotencyFingerprintService } from '../../src/companies/application/idempotency-fingerprint.service'
import {
  COMPANY_ID,
  IDEMPOTENCY_KEY,
  SECRET_TEXT,
  SYNTHETIC_CERTIFICATE,
  SYNTHETIC_PASSWORD,
  TEXT_ENCODER,
  createReplaceInput,
} from '../fixtures/digital-certificate-application.fixture'
import { createSecretServiceFixture } from '../fixtures/digital-certificate-dependencies.fixture'
import { DigitalCertificateRepositoryFixture } from '../fixtures/digital-certificate-repository.fixture'
import {
  captureApiError,
  createReplaceUseCaseFixture,
} from '../fixtures/digital-certificate-use-case.fixture'
import type { DigitalCertificateSecretService } from '../fixtures/digital-certificate-port.fixture'

describe('digital certificate idempotency and rollback contract', () => {
  test('reports first execution and replay outcomes without retaining request buffers', async () => {
    const fixture = await createReplaceUseCaseFixture()
    const firstInput = createReplaceInput()
    const replayInput = createReplaceInput()
    const first = await fixture.useCase.executeWithOutcome(firstInput)
    const replay = await fixture.useCase.executeWithOutcome(replayInput)

    expect(first.replayed).toBe(false)
    expect(replay.replayed).toBe(true)
    expect(replay.certificate).toEqual(first.certificate)
    expectCleared(
      firstInput.certificate,
      firstInput.password,
      replayInput.certificate,
      replayInput.password,
    )
  })

  test('replays without validation, encryption, mutation, or duplicate audit', async () => {
    const fixture = await createReplaceUseCaseFixture()
    const firstInput = createReplaceInput()
    const replayInput = createReplaceInput()

    const first = await fixture.useCase.execute(firstInput)
    const replay = await fixture.useCase.execute(replayInput)

    expect(replay).toEqual(first)
    expect(fixture.validation.inputs).toHaveLength(1)
    expect(fixture.secrets.encryptInputs).toHaveLength(1)
    expect(fixture.repository.replaceInputs).toHaveLength(1)
    expect(fixture.repository.audits).toHaveLength(1)
    expect(fixture.repository.idempotencyRecords).toHaveLength(1)
    expectCleared(replayInput.certificate, replayInput.password)
  })

  test('fingerprints original fields with HMAC without persisting payload or secret', async () => {
    const key = Uint8Array.from({ length: 32 }, (_value, index) => index + 1)
    const fingerprintService = createIdempotencyFingerprintService({ key })
    const fixture = await createReplaceUseCaseFixture({ fingerprintService })

    await fixture.useCase.execute(createReplaceInput())

    const record = fixture.repository.idempotencyRecords[0]
    const expected = await expectedFingerprint(key)
    expect(record?.operation).toBe('digital-certificate.replace')
    expect(record?.fingerprint).toBe(expected)
    const persisted = stringifyWithBigInt({ audits: fixture.repository.audits, record })
    expect(persisted).not.toContain(SECRET_TEXT)
    expect(persisted).not.toContain('certificateBase64')
    expect(persisted).not.toContain('password')
    expect(persisted).not.toContain('secretEnvelope')
  })

  test('rejects a divergent replay without revealing tenant or request details', async () => {
    const fixture = await createReplaceUseCaseFixture()
    await fixture.useCase.execute(createReplaceInput())
    const input = createReplaceInput({
      certificate: TEXT_ENCODER.encode('different synthetic certificate'),
    })

    const error = await captureApiError(() => fixture.useCase.execute(input))

    expect(error).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key cannot be reused',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_ID)
    expect(JSON.stringify(error)).not.toContain(IDEMPOTENCY_KEY)
    expect(fixture.repository.replaceInputs).toHaveLength(1)
    expect(fixture.repository.audits).toHaveLength(1)
  })

  test.each(['gateway', 'encrypt', 'audit', 'idempotency'] as const)(
    'preserves the previous active credential when %s fails',
    async (failure) => {
      const repository = new DigitalCertificateRepositoryFixture()
      repository.seedActive()
      const overrides = createFailureOverrides(failure, repository)
      const fixture = await createReplaceUseCaseFixture({ repository, ...overrides })
      const input = createReplaceInput()

      const error = await captureApiError(() => fixture.useCase.execute(input))

      expect(error).toMatchObject({
        code: 'DIGITAL_CERTIFICATE_OPERATION_FAILED',
        message: 'Digital certificate operation failed',
        status: 500,
      })
      expect(repository.certificates).toHaveLength(1)
      expect(repository.certificates[0]?.status).toBe('active')
      expect(repository.certificates[0]?.secretEnvelope).not.toBeNull()
      expect(repository.audits).toEqual([])
      expect(repository.idempotencyRecords).toEqual([])
      expectCleared(input.certificate, input.password)
    },
  )
})

function createFailureOverrides(
  failure: 'gateway' | 'encrypt' | 'audit' | 'idempotency',
  repository: DigitalCertificateRepositoryFixture,
): {
  readonly certificateValidationGateway?: CertificateValidationGateway
  readonly secretService?: DigitalCertificateSecretService
} {
  if (failure === 'audit' || failure === 'idempotency') repository.failure = failure
  if (failure === 'gateway') return { certificateValidationGateway: throwingGateway() }
  if (failure === 'encrypt') {
    const secrets = createSecretServiceFixture()
    secrets.encryptError = new Error(`encryption diagnostic ${SECRET_TEXT}`)
    return { secretService: secrets.port }
  }
  return {}
}

function throwingGateway(): CertificateValidationGateway {
  return {
    validate() {
      throw new Error(`provider diagnostic ${SECRET_TEXT}`)
    },
  }
}

async function expectedFingerprint(key: Uint8Array): Promise<string> {
  const fields = [
    TEXT_ENCODER.encode('transportada:idempotency:v1'),
    TEXT_ENCODER.encode('digital-certificate.replace'),
    SYNTHETIC_CERTIFICATE,
    SYNTHETIC_PASSWORD,
    TEXT_ENCODER.encode('cte'),
  ]
  const framed = frame(fields)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  )
  return Buffer.from(await crypto.subtle.sign('HMAC', cryptoKey, framed)).toString('base64url')
}

function frame(fields: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(fields.reduce((size, field) => size + 4 + field.byteLength, 0))
  const view = new DataView(output.buffer)
  let offset = 0
  for (const field of fields) {
    view.setUint32(offset, field.byteLength, false)
    offset += 4
    output.set(field, offset)
    offset += field.byteLength
  }
  return output
}

function expectCleared(...buffers: readonly Uint8Array[]): void {
  for (const buffer of buffers) expect([...buffer]).toEqual(new Array(buffer.byteLength).fill(0))
}

function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  )
}
