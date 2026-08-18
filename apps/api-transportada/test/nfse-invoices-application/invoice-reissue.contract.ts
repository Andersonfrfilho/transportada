/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfseInvoiceReissueUseCase } from '../../src/nfse-invoices/application/nfse-invoice-reissue.use-case'
import {
  CONTEXT,
  CORRELATION_ID,
  FROZEN_PAYLOAD,
  IDEMPOTENCY_KEY,
  INVOICE_ID,
  NOW,
  PROFILE,
  createNfseRepositoryFixture,
} from '../fixtures/nfse-invoices-application.fixture'

const REISSUE_INPUT = {
  context: CONTEXT,
  correlationId: CORRELATION_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  invoiceId: INVOICE_ID,
} as const

function createUseCase(overrides: Parameters<typeof createNfseRepositoryFixture>[0] = {}) {
  const fixture = createNfseRepositoryFixture({
    frozenPayload: FROZEN_PAYLOAD,
    invoiceStatus: 'rejected',
    ...overrides,
  })
  return {
    ...fixture,
    useCase: createNfseInvoiceReissueUseCase({
      now: () => new Date(NOW),
      repository: fixture.repository,
    }),
  }
}

describe('nfse invoice reissue correction', () => {
  test('a correção troca os campos no payload da tentativa nova, com hash diferente do congelado', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute({
      ...REISSUE_INPUT,
      correction: { description: 'Serviço de transporte corrigido.', issExigibility: '6' },
    })

    expect(recording.payloads[0]?.payload).toMatchObject({
      description: 'Serviço de transporte corrigido.',
      issExigibility: '6',
    })
    expect(recording.payloads[0]?.payloadSha256).not.toBe(FROZEN_PAYLOAD.payloadSha256)
  })

  test('issRate corrigida recalcula o issAmount por Decimal no payload da tentativa nova', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute({ ...REISSUE_INPUT, correction: { issRate: '0.060000' } })

    // serviceAmount '10000.0000' × issRate '0.060000', arredondado nas 4 casas do moneyColumn.
    expect(recording.payloads[0]?.payload).toMatchObject({ issAmount: '600.0000' })
  })

  test('issRate corrigida grava o issAmount recalculado em nfse_service_invoices, via markIssuing', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute({ ...REISSUE_INPUT, correction: { issRate: '0.060000' } })

    expect(recording.issuings[0]?.issAmount).toBe('600.0000')
  })

  test('descrição corrigida reescreve a descrição da fatura, e nenhuma outra coluna muda', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute({
      ...REISSUE_INPUT,
      correction: { description: 'Nova descrição corrigida.' },
    })

    expect(recording.issuings[0]).toEqual({
      description: 'Nova descrição corrigida.',
      invoiceId: INVOICE_ID,
      requestedAt: NOW,
      status: 'issuing',
    })
  })

  test('sem correção, a tentativa nova retransmite o payload congelado tal como está', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute(REISSUE_INPUT)

    expect(recording.payloads[0]?.payload).toEqual(FROZEN_PAYLOAD.payload)
    expect(recording.payloads[0]?.payloadSha256).toBe(FROZEN_PAYLOAD.payloadSha256)
    expect(recording.issuings[0]?.description).toBeUndefined()
    expect(recording.issuings[0]?.issAmount).toBeUndefined()
  })

  test('a correção não toca no perfil de emissão', async () => {
    const { state, useCase } = createUseCase()

    await useCase.execute({
      ...REISSUE_INPUT,
      correction: { description: 'Nova descrição corrigida.', issRate: '0.060000' },
    })

    expect(state.profile).toEqual(PROFILE)
  })
})
