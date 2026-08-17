/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfseInvoiceCancellationUseCase } from '../../src/nfse-invoices/application/nfse-invoice-cancellation.use-case'
import {
  NFSE_CANCEL_EVENT_NAME,
  NFSE_CANCEL_OUTBOX_EVENT,
  createCancellationFingerprint,
} from '../../src/nfse-invoices/application/nfse-issuance-attempt.service'
import {
  NfseCredentialMissingError,
  NfseIdempotencyKeyReusedError,
  NfseInvoiceNotFoundError,
  NfseInvoiceTransitionBlockedError,
} from '../../src/nfse-invoices/domain/nfse-issuance.error'
import {
  ATTEMPT_ID,
  CONTEXT,
  COMPANY_ID,
  DOCUMENT_ID,
  IDEMPOTENCY_KEY,
  INVOICE_ID,
  NOW,
  createNfseRepositoryFixture,
} from '../fixtures/nfse-invoices-application.fixture'

const CORRELATION_ID = 'nfse-invoice-cancellation-correlation'
const REASON = 'Nota emitida com valor de serviço errado.'
const MOTIVE = '2'

const CANCEL_INPUT = {
  cancellationMotive: MOTIVE,
  cancellationReason: REASON,
  context: CONTEXT,
  correlationId: CORRELATION_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  invoiceId: INVOICE_ID,
} as const

function createUseCase(overrides: Parameters<typeof createNfseRepositoryFixture>[0] = {}) {
  const fixture = createNfseRepositoryFixture(overrides)
  return {
    ...fixture,
    useCase: createNfseInvoiceCancellationUseCase({
      now: () => new Date(NOW),
      repository: fixture.repository,
    }),
  }
}

describe('nfse invoice cancellation', () => {
  /**
   * Este é o coração do cancelamento: liberar o vínculo e registrar o pedido na mesma transação. Se
   * a liberação ficasse para o write-back da prefeitura, a NF-e passaria horas presa a uma nota que
   * já não vale.
   */
  test('libera os vínculos na mesma transação do pedido', async () => {
    const { recording, useCase } = createUseCase()

    const summary = await useCase.execute(CANCEL_INPUT)

    expect(recording.transactionScopes).toEqual([COMPANY_ID])
    expect(recording.releases).toEqual([{ cancelledAt: NOW, invoiceId: INVOICE_ID }])
    expect(summary.releasedDocumentIds).toEqual([DOCUMENT_ID])
    expect(recording.steps.indexOf('releaseDocumentLinks')).toBeLessThan(
      recording.steps.indexOf('pushOutbox'),
    )
  })

  test('grava o motivo informado na nota', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute(CANCEL_INPUT)

    expect(recording.cancellations).toEqual([
      {
        cancellationMotive: MOTIVE,
        cancellationReason: REASON,
        invoiceId: INVOICE_ID,
        requestedAt: NOW,
        status: 'cancellation_requested',
      },
    ])
  })

  /**
   * Quem cancela um documento fiscal é a prefeitura. A nota sai do pedido em
   * `cancellation_requested` — nem parada em `authorized`, que esconderia o pedido de quem o fez,
   * nem já em `cancelled`, que afirmaria um cancelamento que ainda não aconteceu.
   */
  test('deixa a nota em cancellation_requested, não em authorized nem em cancelled', async () => {
    const { recording, useCase } = createUseCase()

    const summary = await useCase.execute(CANCEL_INPUT)

    expect(summary.status).toBe('cancellation_requested')
    expect(recording.cancellations[0]?.status).toBe('cancellation_requested')
  })

  /** A prefeitura é chamada pelo worker: a transação só deixa o pedido na outbox. */
  test('enfileira o cancelamento na outbox com a tentativa criada', async () => {
    const { recording, useCase } = createUseCase()

    const summary = await useCase.execute(CANCEL_INPUT)

    expect(recording.attempts[0]?.attemptKind).toBe('cancel')
    expect(recording.events[0]?.eventName).toBe(NFSE_CANCEL_EVENT_NAME)
    expect(recording.outbox).toHaveLength(1)
    expect(recording.outbox[0]?.eventType).toBe(NFSE_CANCEL_OUTBOX_EVENT)
    expect(summary.attemptId).toBe(ATTEMPT_ID)
    expect(summary.replayed).toBe(false)
  })

  /** Dois cliques no botão não podem virar dois pedidos de cancelamento na prefeitura. */
  test('a mesma chave com o mesmo motivo devolve o pedido original sem liberar de novo', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute(CANCEL_INPUT)
    const replay = await useCase.execute(CANCEL_INPUT)

    expect(replay.replayed).toBe(true)
    expect(replay.attemptId).toBe(ATTEMPT_ID)
    expect(recording.releases).toHaveLength(1)
    expect(recording.outbox).toHaveLength(1)
  })

  test('a mesma chave com outro motivo é recusada', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute(CANCEL_INPUT)

    await expect(
      useCase.execute({ ...CANCEL_INPUT, cancellationReason: 'Outro motivo qualquer.' }),
    ).rejects.toBeInstanceOf(NfseIdempotencyKeyReusedError)
    expect(recording.releases).toHaveLength(1)
  })

  /** Trocar só o código, mantendo o texto, é outro pedido: é o código que a prefeitura lê. */
  test('a mesma chave com outro código de motivo é recusada', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute(CANCEL_INPUT)

    await expect(
      useCase.execute({ ...CANCEL_INPUT, cancellationMotive: '4' }),
    ).rejects.toBeInstanceOf(NfseIdempotencyKeyReusedError)
    expect(recording.releases).toHaveLength(1)
  })

  test('o código e o texto do motivo entram na digital do pedido', () => {
    const original = createCancellationFingerprint({
      cancellationMotive: MOTIVE,
      cancellationReason: REASON,
      invoiceId: INVOICE_ID,
    })
    const editedReason = createCancellationFingerprint({
      cancellationMotive: MOTIVE,
      cancellationReason: 'Outro motivo qualquer.',
      invoiceId: INVOICE_ID,
    })
    const editedMotive = createCancellationFingerprint({
      cancellationMotive: '4',
      cancellationReason: REASON,
      invoiceId: INVOICE_ID,
    })

    expect(original).not.toBe(editedReason)
    expect(original).not.toBe(editedMotive)
    expect(original).toMatch(/^[0-9a-f]{64}$/)
  })

  /** Só nota autorizada vai para a prefeitura; o resto sequer chegou a existir lá. */
  test('nota fora de autorizada não é cancelada', async () => {
    const { recording, useCase } = createUseCase({ invoiceStatus: 'requested' })

    await expect(useCase.execute(CANCEL_INPUT)).rejects.toBeInstanceOf(
      NfseInvoiceTransitionBlockedError,
    )
    expect(recording.releases).toHaveLength(0)
    expect(recording.outbox).toHaveLength(0)
  })

  test('nota já cancelada não é cancelada de novo', async () => {
    const { recording, useCase } = createUseCase({ invoiceStatus: 'cancelled' })

    await expect(useCase.execute(CANCEL_INPUT)).rejects.toBeInstanceOf(
      NfseInvoiceTransitionBlockedError,
    )
    expect(recording.releases).toHaveLength(0)
  })

  /** Nota de outra empresa não é encontrada pelo recorte do repositório — e some, não vira 403. */
  test('nota inexistente para a empresa do contexto é 404', async () => {
    const { recording, useCase } = createUseCase({ invoiceDetail: null })

    await expect(useCase.execute(CANCEL_INPUT)).rejects.toBeInstanceOf(NfseInvoiceNotFoundError)
    expect(recording.releases).toHaveLength(0)
  })

  /** Sem credencial ativa o worker não teria como autenticar: melhor falhar antes de liberar nada. */
  test('sem credencial ativa o pedido é recusado antes de liberar os vínculos', async () => {
    const { recording, useCase } = createUseCase({ credential: null })

    await expect(useCase.execute(CANCEL_INPUT)).rejects.toBeInstanceOf(NfseCredentialMissingError)
    expect(recording.releases).toHaveLength(0)
    expect(recording.outbox).toHaveLength(0)
  })
})
