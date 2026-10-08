/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfseInvoiceReissueUseCase } from '../../src/nfse-invoices/application/nfse-invoice-reissue.use-case'
import { createNfseInvoiceUseCase } from '../../src/nfse-invoices/application/nfse-invoice.use-case'
import { NfseNationalTaxationCodeMissingError } from '../../src/nfse-invoices/domain/nfse-issuance.error'
import type { NfseProviderApiVersion } from '../../src/shared/nfse-provider-api-version.constant'
import {
  CONTEXT,
  CORRELATION_ID,
  DOCUMENT_ID,
  FROZEN_PAYLOAD,
  IDEMPOTENCY_KEY,
  INVOICE_ID,
  NATIONAL_PROFILE,
  NOW,
  PROFILE,
  PROFILE_ID,
  createNfseRepositoryFixture,
} from '../fixtures/nfse-invoices-application.fixture'

const CREATE_INPUT = {
  context: CONTEXT,
  correlationId: CORRELATION_ID,
  documentIds: [DOCUMENT_ID],
  idempotencyKey: IDEMPOTENCY_KEY,
  profileId: PROFILE_ID,
} as const

const REISSUE_INPUT = {
  context: CONTEXT,
  correlationId: CORRELATION_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  invoiceId: INVOICE_ID,
} as const

function createUseCase(
  providerApiVersion: NfseProviderApiVersion,
  overrides: Parameters<typeof createNfseRepositoryFixture>[0] = {},
) {
  const fixture = createNfseRepositoryFixture(overrides)
  return {
    ...fixture,
    useCase: createNfseInvoiceUseCase({
      now: () => new Date(NOW),
      providerApiVersion,
      repository: fixture.repository,
    }),
  }
}

function createReissueUseCase(
  providerApiVersion: NfseProviderApiVersion,
  overrides: Parameters<typeof createNfseRepositoryFixture>[0] = {},
) {
  const fixture = createNfseRepositoryFixture({
    frozenPayload: FROZEN_PAYLOAD,
    invoiceStatus: 'rejected',
    ...overrides,
  })
  return {
    ...fixture,
    useCase: createNfseInvoiceReissueUseCase({
      now: () => new Date(NOW),
      providerApiVersion,
      repository: fixture.repository,
    }),
  }
}

describe('nfse invoice creation under the provider api version', () => {
  test('na v3 o payload congelado leva o código nacional e a alíquota do Simples do perfil', async () => {
    const { recording, useCase } = createUseCase('v3', { profile: NATIONAL_PROFILE })

    await useCase.create(CREATE_INPUT)

    expect(recording.payloads[0]?.payload).toMatchObject({
      nationalTaxationCode: '160201',
      simplesNationalRate: '2.000000',
    })
    expect(
      typeof (recording.payloads[0]?.payload as { simplesNationalRate: unknown })
        .simplesNationalRate,
    ).toBe('string')
  })

  test('o providerConfig grava a versão da API com que a tentativa nasceu', async () => {
    const v3 = createUseCase('v3', { profile: NATIONAL_PROFILE })
    const v2 = createUseCase('v2')

    await v3.useCase.create(CREATE_INPUT)
    await v2.useCase.create(CREATE_INPUT)

    expect(v3.recording.payloads[0]?.providerConfig).toMatchObject({ providerApiVersion: 'v3' })
    expect(v2.recording.payloads[0]?.providerConfig).toMatchObject({ providerApiVersion: 'v2' })
  })

  test('na v2 o payload não ganha campo nenhum e o hash segue o de antes', async () => {
    const legacy = createUseCase('v2', { profile: NATIONAL_PROFILE })
    const untouched = createNfseRepositoryFixture()
    const baseline = createNfseInvoiceUseCase({
      now: () => new Date(NOW),
      repository: untouched.repository,
    })

    await legacy.useCase.create(CREATE_INPUT)
    await baseline.create(CREATE_INPUT)

    expect(legacy.recording.payloads[0]?.payload).not.toHaveProperty('nationalTaxationCode')
    expect(legacy.recording.payloads[0]?.payload).not.toHaveProperty('simplesNationalRate')
    expect(legacy.recording.payloads[0]?.payloadSha256).toBe(
      untouched.recording.payloads[0]?.payloadSha256,
    )
  })

  test('na v3, perfil sem código nacional recusa a criação com 409 e nada é gravado', async () => {
    const { recording, useCase } = createUseCase('v3', {
      profile: { ...NATIONAL_PROFILE, nationalTaxationCode: null },
    })

    const error = await useCase.create(CREATE_INPUT).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(NfseNationalTaxationCodeMissingError)
    expect(error).toMatchObject({ code: 'NFSE_NATIONAL_TAXATION_CODE_MISSING', status: 409 })
    expect(recording.invoices).toHaveLength(0)
    expect(recording.outbox).toHaveLength(0)
  })

  test('na v3, perfil sem alíquota do Simples recusa a criação com o mesmo código', async () => {
    const { recording, useCase } = createUseCase('v3', {
      profile: { ...NATIONAL_PROFILE, simplesNationalRate: null },
    })

    await expect(useCase.create(CREATE_INPUT)).rejects.toMatchObject({
      code: 'NFSE_NATIONAL_TAXATION_CODE_MISSING',
      status: 409,
    })
    expect(recording.invoices).toHaveLength(0)
  })

  test('na v2, perfil sem os campos nacionais emite normalmente', async () => {
    const { recording, useCase } = createUseCase('v2', { profile: PROFILE })

    await useCase.create(CREATE_INPUT)

    expect(recording.invoices).toHaveLength(1)
  })
})

describe('nfse invoice reissue under the provider api version', () => {
  test('a correção aceita o código nacional e a alíquota do Simples e os congela no payload novo', async () => {
    const { recording, useCase } = createReissueUseCase('v3')

    await useCase.execute({
      ...REISSUE_INPUT,
      correction: { nationalTaxationCode: '160201', simplesNationalRate: '2.000000' },
    })

    expect(recording.payloads[0]?.payload).toMatchObject({
      nationalTaxationCode: '160201',
      simplesNationalRate: '2.000000',
    })
    expect(recording.payloads[0]?.providerConfig).toMatchObject({ providerApiVersion: 'v3' })
  })

  test('na v3, reemitir um payload sem os campos e sem corrigi-los dá 409 e não cria tentativa', async () => {
    const { recording, useCase } = createReissueUseCase('v3')

    await expect(useCase.execute(REISSUE_INPUT)).rejects.toMatchObject({
      code: 'NFSE_NATIONAL_TAXATION_CODE_MISSING',
      status: 409,
    })
    expect(recording.attempts).toHaveLength(0)
  })

  test('na v2 a reemissão sem os campos segue como antes', async () => {
    const { recording, useCase } = createReissueUseCase('v2')

    await useCase.execute(REISSUE_INPUT)

    expect(recording.payloads[0]?.payloadSha256).toBe(FROZEN_PAYLOAD.payloadSha256)
  })

  test('a correção do código nacional muda a digital do pedido (não é replay)', async () => {
    const { recording, useCase } = createReissueUseCase('v3')

    await useCase.execute({
      ...REISSUE_INPUT,
      correction: { nationalTaxationCode: '160201', simplesNationalRate: '2.000000' },
    })
    const other = createReissueUseCase('v3')
    await other.useCase.execute({
      ...REISSUE_INPUT,
      correction: { nationalTaxationCode: '160202', simplesNationalRate: '2.000000' },
    })

    expect(recording.attempts[0]?.requestFingerprint).not.toBe(
      other.recording.attempts[0]?.requestFingerprint,
    )
  })
})

describe('nfse reissue provider request key', () => {
  const AMBIGUOUS = {
    lastErrorCause: 'timeout',
    providerDocumentId: null,
    providerRequestKey: '00000000-0000-4000-8000-0000000000e1',
    status: 'failed',
  } as const

  test('primeira reemissão sem histórico: a tentativa não leva chave herdada', async () => {
    const { recording, useCase } = createReissueUseCase('v3', { latestIssueAttempt: null })

    await useCase.execute({
      ...REISSUE_INPUT,
      correction: { nationalTaxationCode: '160201', simplesNationalRate: '2.000000' },
    })

    expect(recording.attempts[0]).not.toHaveProperty('providerRequestKey')
  })

  test('tentativa anterior rejeitada: chave nova (a da própria tentativa)', async () => {
    const { recording, useCase } = createReissueUseCase('v3', {
      latestIssueAttempt: { ...AMBIGUOUS, lastErrorCause: null, status: 'rejected' },
    })

    await useCase.execute({
      ...REISSUE_INPUT,
      correction: { nationalTaxationCode: '160201', simplesNationalRate: '2.000000' },
    })

    expect(recording.attempts[0]).not.toHaveProperty('providerRequestKey')
  })

  test('tentativa anterior ambígua: a chave é copiada, senão o timeout duplicaria a nota', async () => {
    const { recording, useCase } = createReissueUseCase('v3', {
      invoiceStatus: 'failed',
      latestIssueAttempt: AMBIGUOUS,
    })

    await useCase.execute({
      ...REISSUE_INPUT,
      correction: { nationalTaxationCode: '160201', simplesNationalRate: '2.000000' },
    })

    expect(recording.attempts[0]?.providerRequestKey).toBe(AMBIGUOUS.providerRequestKey)
  })

  test('tentativa anterior ambígua sem chave gravada: chave nova', async () => {
    const { recording, useCase } = createReissueUseCase('v3', {
      invoiceStatus: 'failed',
      latestIssueAttempt: { ...AMBIGUOUS, providerRequestKey: null },
    })

    await useCase.execute({
      ...REISSUE_INPUT,
      correction: { nationalTaxationCode: '160201', simplesNationalRate: '2.000000' },
    })

    expect(recording.attempts[0]).not.toHaveProperty('providerRequestKey')
  })
})
