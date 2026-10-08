/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfseInvoiceExternalLinkUseCase } from '../../src/nfse-invoices/application/nfse-invoice-external-link.use-case'
import {
  CONTEXT,
  CORRELATION_ID,
  FROZEN_PAYLOAD,
  IDEMPOTENCY_KEY,
  INVOICE_ID,
  NOW,
  createNfseRepositoryFixture,
} from '../fixtures/nfse-invoices-application.fixture'

const PROVIDER_DOCUMENT_ID = '4821'

const LINK_INPUT = {
  context: CONTEXT,
  correlationId: CORRELATION_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  invoiceId: INVOICE_ID,
  providerDocumentId: PROVIDER_DOCUMENT_ID,
} as const

function createUseCase(overrides: Parameters<typeof createNfseRepositoryFixture>[0] = {}) {
  const fixture = createNfseRepositoryFixture({
    frozenPayload: FROZEN_PAYLOAD,
    invoiceStatus: 'rejected',
    ...overrides,
  })
  return {
    ...fixture,
    useCase: createNfseInvoiceExternalLinkUseCase({
      now: () => new Date(NOW),
      repository: fixture.repository,
    }),
  }
}

async function failureCode(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return (error as { code?: unknown }).code
  }
  return undefined
}

describe('nfse invoice external link', () => {
  test('liga a nota rejeitada ao id_nota e a deixa em pending_authorization', async () => {
    const { recording, useCase } = createUseCase()

    const summary = await useCase.execute(LINK_INPUT)

    expect(summary).toMatchObject({
      invoiceId: INVOICE_ID,
      replayed: false,
      status: 'pending_authorization',
    })
    expect(recording.externalLinks).toEqual([
      {
        invoiceId: INVOICE_ID,
        providerDocumentId: PROVIDER_DOCUMENT_ID,
        requestedAt: NOW,
        status: 'pending_authorization',
      },
    ])
  })

  test('aceita a nota que falhou na transmissão', async () => {
    const { useCase } = createUseCase({ invoiceStatus: 'failed' })

    const summary = await useCase.execute(LINK_INPUT)

    expect(summary.status).toBe('pending_authorization')
  })

  test('a tentativa nasce aceita, sem chave do provedor, com o payload congelado e externalLink', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute(LINK_INPUT)

    expect(recording.attempts[0]).toMatchObject({
      attemptKind: 'issue',
      externalLink: true,
      idempotencyKey: IDEMPOTENCY_KEY,
      invoiceId: INVOICE_ID,
    })
    expect(recording.attempts[0]?.providerRequestKey).toBeUndefined()
    expect(recording.payloads[0]?.payload).toEqual(FROZEN_PAYLOAD.payload)
    expect(recording.payloads[0]?.payloadSha256).toBe(FROZEN_PAYLOAD.payloadSha256)
    expect(recording.payloads[0]?.providerConfig).toMatchObject({
      externalLink: true,
      providerApiVersion: 'v3',
    })
  })

  test('fixa a tentativa de vínculo em v3, o id_nota do portal é um id v3, seja qual for a versão do ambiente', async () => {
    const fixture = createNfseRepositoryFixture({
      frozenPayload: FROZEN_PAYLOAD,
      invoiceStatus: 'rejected',
    })
    const useCase = createNfseInvoiceExternalLinkUseCase({
      now: () => new Date(NOW),
      repository: fixture.repository,
    })

    await useCase.execute(LINK_INPUT)

    expect(fixture.recording.payloads[0]?.providerConfig).toMatchObject({
      externalLink: true,
      providerApiVersion: 'v3',
    })
  })

  test('grava o evento accepted com a origem e nenhuma linha de outbox', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute(LINK_INPUT)

    expect(recording.events).toHaveLength(1)
    expect(recording.events[0]).toMatchObject({
      eventName: 'accepted',
      invoiceId: INVOICE_ID,
      payload: { source: 'external_link' },
    })
    expect(recording.outbox).toEqual([])
  })

  test('audita o vínculo com ator, permissão, antes, depois e correlação', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute(LINK_INPUT)

    expect(recording.audits).toEqual([
      {
        action: 'nfse.invoice.external_link',
        actorUserId: CONTEXT.userId,
        after: { providerDocumentId: PROVIDER_DOCUMENT_ID, status: 'pending_authorization' },
        before: { status: 'rejected' },
        companyId: CONTEXT.companyId,
        correlationId: CORRELATION_ID,
        invoiceId: INVOICE_ID,
        permission: 'nfse.issue',
      },
    ])
  })

  test('repetir a chave com o mesmo corpo devolve o replay sem escrever de novo', async () => {
    const { recording, useCase, state } = createUseCase()
    await useCase.execute(LINK_INPUT)
    const attemptsBefore = recording.attempts.length

    const summary = await useCase.execute(LINK_INPUT)

    expect(summary.replayed).toBe(true)
    expect(recording.attempts).toHaveLength(attemptsBefore)
    expect(recording.externalLinks).toHaveLength(1)
    expect(state.attemptByKey.size).toBe(1)
  })

  test('a mesma chave com outro id_nota é 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const { useCase } = createUseCase()
    await useCase.execute(LINK_INPUT)

    const code = await failureCode(useCase.execute({ ...LINK_INPUT, providerDocumentId: '9999' }))

    expect(code).toBe('IDEMPOTENCY_KEY_REUSED')
  })

  test('id_nota já ligado a outra nota da empresa é NFSE_PROVIDER_DOCUMENT_ALREADY_LINKED', async () => {
    const { useCase } = createUseCase({ linkedProviderDocumentIds: [PROVIDER_DOCUMENT_ID] })

    expect(await failureCode(useCase.execute(LINK_INPUT))).toBe(
      'NFSE_PROVIDER_DOCUMENT_ALREADY_LINKED',
    )
  })

  test('nota de outra empresa (não encontrada no escopo) é NFSE_INVOICE_NOT_FOUND', async () => {
    const { useCase } = createUseCase({ invoiceDetail: null })

    expect(await failureCode(useCase.execute(LINK_INPUT))).toBe('NFSE_INVOICE_NOT_FOUND')
  })

  test('sem credencial ativa é NFSE_CREDENTIAL_MISSING e nada é escrito', async () => {
    const { recording, useCase } = createUseCase({ credential: null })

    expect(await failureCode(useCase.execute(LINK_INPUT))).toBe('NFSE_CREDENTIAL_MISSING')
    expect(recording.externalLinks).toEqual([])
  })

  test('qualquer outro estado bloqueia com o código da tabela de transições', async () => {
    const { recording, useCase } = createUseCase({ invoiceStatus: 'authorized' })

    expect(await failureCode(useCase.execute(LINK_INPUT))).toBe('NFSE_INVOICE_ALREADY_AUTHORIZED')
    expect(recording.attempts).toEqual([])
  })
})
