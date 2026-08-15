/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createInvoiceFingerprint } from '../../src/nfse-invoices/application/nfse-issuance-attempt.service'
import { createNfseInvoiceUseCase } from '../../src/nfse-invoices/application/nfse-invoice.use-case'
import { NfseIdempotencyKeyReusedError } from '../../src/nfse-invoices/domain/nfse-issuance.error'
import {
  ATTEMPT_ID,
  DOCUMENT_ID,
  IDEMPOTENCY_KEY,
  INVOICE_ID,
  NOW,
  OTHER_DOCUMENT_ID,
  PROFILE_ID,
  CONTEXT,
  createNfseRepositoryFixture,
  selectionDocument,
} from '../fixtures/nfse-invoices-application.fixture'

const CORRELATION_ID = 'nfse-invoice-idempotency-correlation'

const CREATE_INPUT = {
  context: CONTEXT,
  correlationId: CORRELATION_ID,
  documentIds: [DOCUMENT_ID],
  idempotencyKey: IDEMPOTENCY_KEY,
  profileId: PROFILE_ID,
} as const

function createUseCase(overrides: Parameters<typeof createNfseRepositoryFixture>[0] = {}) {
  const fixture = createNfseRepositoryFixture(overrides)
  return {
    ...fixture,
    useCase: createNfseInvoiceUseCase({ now: () => new Date(NOW), repository: fixture.repository }),
  }
}

describe('nfse invoice idempotency', () => {
  /** Repetição de rede não emite duas notas: a mesma chave com o mesmo pedido devolve a primeira. */
  test('a mesma chave com o mesmo pedido devolve a tentativa original sem gravar de novo', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.create(CREATE_INPUT)
    const replay = await useCase.create(CREATE_INPUT)

    expect(replay.replayed).toBe(true)
    expect(replay.attemptId).toBe(ATTEMPT_ID)
    expect(replay.invoiceId).toBe(INVOICE_ID)
    expect(recording.invoices).toHaveLength(1)
    expect(recording.outbox).toHaveLength(1)
  })

  /** A chave é escolhida pelo cliente: reaproveitá-la para outra seleção seria emitir errado calado. */
  test('a mesma chave com outro pedido é recusada', async () => {
    const { recording, useCase } = createUseCase({
      documents: [
        selectionDocument(),
        selectionDocument({ documentId: OTHER_DOCUMENT_ID, number: '000000124' }),
      ],
    })

    await useCase.create(CREATE_INPUT)

    await expect(
      useCase.create({ ...CREATE_INPUT, documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID] }),
    ).rejects.toBeInstanceOf(NfseIdempotencyKeyReusedError)
    expect(recording.invoices).toHaveLength(1)
  })

  /** A ordem em que a tela mandou os documentos não muda o pedido — só o conjunto conta. */
  test('a digital do pedido não depende da ordem dos documentos', () => {
    const ascending = createInvoiceFingerprint({
      descriptionTemplate: '',
      documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
      profileId: PROFILE_ID,
    })
    const descending = createInvoiceFingerprint({
      descriptionTemplate: '',
      documentIds: [OTHER_DOCUMENT_ID, DOCUMENT_ID],
      profileId: PROFILE_ID,
    })

    expect(ascending).toBe(descending)
    expect(ascending).toMatch(/^[0-9a-f]{64}$/)
  })

  test('descrição diferente é outro pedido, mesmo com os mesmos documentos', () => {
    const original = createInvoiceFingerprint({
      descriptionTemplate: '',
      documentIds: [DOCUMENT_ID],
      profileId: PROFILE_ID,
    })
    const edited = createInvoiceFingerprint({
      descriptionTemplate: 'Serviço de transporte referente às notas {{notas}}.',
      documentIds: [DOCUMENT_ID],
      profileId: PROFILE_ID,
    })

    expect(edited).not.toBe(original)
  })
})

describe('nfse invoice preview', () => {
  /** A prévia não grava nada: abrir transação aqui prenderia conexão do pool para só ler. */
  test('a prévia não abre transação', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.preview({
      context: CONTEXT,
      documentIds: [DOCUMENT_ID],
      profileId: PROFILE_ID,
    })

    expect(recording.transactionScopes).toEqual([])
    expect(recording.invoices).toHaveLength(0)
  })

  /** Bloqueio na prévia é dado, não erro: a tela precisa mostrar o que ficou de fora e por quê. */
  test('a prévia devolve o documento bloqueado como dado', async () => {
    const { useCase } = createUseCase({
      documents: [
        selectionDocument(),
        selectionDocument({
          accessKey: '35260812345678000199550010000001241000000124',
          documentId: OTHER_DOCUMENT_ID,
          number: '000000124',
        }),
      ],
      invoiceLinks: [{ documentId: OTHER_DOCUMENT_ID, ownerId: INVOICE_ID }],
    })

    const preview = await useCase.preview({
      context: CONTEXT,
      documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
      profileId: PROFILE_ID,
    })

    expect(preview.blocked).toEqual([
      { documentId: OTHER_DOCUMENT_ID, reason: 'NFSE_DOCUMENT_ALREADY_LINKED' },
    ])
    expect(preview.invoices).toHaveLength(1)
  })

  test('a prévia projeta a nota com o serviço e o ISS calculados', async () => {
    const { useCase } = createUseCase()

    const preview = await useCase.preview({
      context: CONTEXT,
      documentIds: [DOCUMENT_ID],
      profileId: PROFILE_ID,
    })

    expect(preview.blocked).toEqual([])
    expect(preview.invoices).toHaveLength(1)
    expect(preview.invoices[0]?.serviceAmount).toBe('850.00')
    expect(preview.invoices[0]?.issAmount).toBe('42.50')
  })
})
