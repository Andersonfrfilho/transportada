/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfseInvoiceDiscardUseCase } from '../../src/nfse-invoices/application/nfse-invoice-discard.use-case'
import {
  CONTEXT,
  COMPANY_ID,
  DOCUMENT_ID,
  IDEMPOTENCY_KEY,
  INVOICE_ID,
  NOW,
  createNfseRepositoryFixture,
} from '../fixtures/nfse-invoices-application.fixture'

const CORRELATION_ID = 'nfse-invoice-discard-correlation'

const DISCARD_INPUT = {
  context: CONTEXT,
  correlationId: CORRELATION_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  invoiceId: INVOICE_ID,
} as const

function createUseCase(overrides: Parameters<typeof createNfseRepositoryFixture>[0] = {}) {
  const fixture = createNfseRepositoryFixture({ invoiceStatus: 'rejected', ...overrides })
  return {
    ...fixture,
    useCase: createNfseInvoiceDiscardUseCase({
      now: () => new Date(NOW),
      repository: fixture.repository,
    }),
  }
}

/**
 * T010: a devolução das notas não é um caminho próprio do descarte — é o **mesmo** seam do
 * cancelamento (`releaseDocumentLinks`, carimbando `cancelled_at`). `test/nfse-schema/
 * invoice-release-eligibility.contract.ts` já prova, sem tocar neste task, que tanto
 * `buildActiveInvoiceLinkFilters` (seleção de NFS-e) quanto `buildActiveNfseLinkFilters` (seleção
 * de lote de CT-e) ignoram vínculo com `cancelled_at` carimbado. Provar aqui que o descarte carimba
 * pelo mesmo seam fecha a corrente: descartar → `cancelled_at` carimbado → as duas seleções voltam
 * a enxergar o documento.
 */
describe('nfse invoice discard', () => {
  test('libera os vínculos na mesma transação do descarte, pelo mesmo seam do cancelamento', async () => {
    const { recording, useCase } = createUseCase()

    const summary = await useCase.execute(DISCARD_INPUT)

    expect(recording.transactionScopes).toEqual([COMPANY_ID])
    expect(recording.releases).toEqual([{ cancelledAt: NOW, invoiceId: INVOICE_ID }])
    expect(summary.releasedDocumentIds).toEqual([DOCUMENT_ID])
    expect(recording.steps.indexOf('releaseDocumentLinks')).toBeLessThan(
      recording.steps.indexOf('markDiscarded'),
    )
  })

  test('a fatura termina em discarded, e é esse status que fecha a transição', async () => {
    const { recording, useCase } = createUseCase()

    const summary = await useCase.execute(DISCARD_INPUT)

    expect(summary.status).toBe('discarded')
    expect(recording.discards).toEqual([
      { discardedAt: NOW, invoiceId: INVOICE_ID, status: 'discarded' },
    ])
  })

  test('descartar não abre tentativa nem outbox — não há viagem à prefeitura', async () => {
    const { recording, useCase } = createUseCase()

    await useCase.execute(DISCARD_INPUT)

    expect(recording.attempts).toEqual([])
    expect(recording.outbox).toEqual([])
  })
})
