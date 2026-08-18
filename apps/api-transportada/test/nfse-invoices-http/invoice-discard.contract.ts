/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { NfseInvoiceTransitionBlockedError } from '../../src/nfse-invoices/domain/nfse-issuance.error'
import { NFSE_TRANSITION_BLOCK } from '../../src/nfse-invoices/domain/nfse-invoice-state.policy'
import { API_NFSE_SERVICE_INVOICES_PATH } from '../../src/shared/api.constant'
import {
  COMPANY_CONTEXT,
  DOCUMENT_ID,
  INVOICE_ID,
  READ_ONLY_PERMISSIONS,
  createNfseInvoicesHttpFixture,
  invoiceRequest,
  invoiceRequestWithoutBody,
} from '../fixtures/nfse-invoices-http.fixture'

const DISCARD_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/${INVOICE_ID}/discard`

describe('nfse service invoice discard http', () => {
  /**
   * Descartar não tem corpo: o payload errado não se corrige aqui, se descarta. `202` com os
   * vínculos liberados é o contrato — as mesmas notas voltam à seleção de NFS-e e de CT-e.
   */
  test('o descarte devolve 202 com os documentos liberados', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceRequest({ body: {}, path: DISCARD_PATH }))
    const body = (await response.json()) as {
      data: {
        invoiceId: string
        releasedDocumentIds: readonly string[]
        replayed: boolean
        status: string
      }
    }

    expect(response.status).toBe(202)
    expect(body.data.invoiceId).toBe(INVOICE_ID)
    expect(body.data.releasedDocumentIds).toEqual([DOCUMENT_ID])
    expect(body.data.replayed).toBe(false)
    expect(body.data.status).toBe('discarded')
  })

  /**
   * "Sem corpo" é o que o cliente manda de verdade — sem body e sem `content-type`. Exigir
   * `application/json` numa rota cujo corpo é vazio recusava todo descarte em produção com `400`,
   * e o contrato não via porque montava o pedido com `{}`.
   */
  test('o descarte sem corpo nenhum é aceito, não recusado por content-type', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceRequestWithoutBody({ path: DISCARD_PATH }))

    expect(response.status).toBe(202)
    expect(fixture.discardCalls).toHaveLength(1)
    expect(fixture.discardCalls[0]?.invoiceId).toBe(INVOICE_ID)
  })

  test('a rota propaga chave de idempotência, correlation-id e empresa', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(invoiceRequest({ body: {}, path: DISCARD_PATH }))

    expect(fixture.discardCalls).toHaveLength(1)
    expect(fixture.discardCalls[0]?.idempotencyKey).toBeDefined()
    expect(fixture.discardCalls[0]?.correlationId).toBe('nfse-invoices-http-correlation')
    expect(fixture.discardCalls[0]?.invoiceId).toBe(INVOICE_ID)
    expect(fixture.discardCalls[0]?.companyId).toBe(COMPANY_CONTEXT.companyId)
  })

  /** Descartar reusa a permissão do cancelamento: as duas encerram a fatura sem passar pela emissão. */
  test('descartar exige nfse.cancel — leitura sozinha não basta', async () => {
    const fixture = await createNfseInvoicesHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(invoiceRequest({ body: {}, path: DISCARD_PATH }))

    expect(response.status).toBe(403)
    expect(fixture.discardCalls).toHaveLength(0)
  })

  test('descartar sem chave de idempotência é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: {}, idempotencyKey: null, path: DISCARD_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.discardCalls).toHaveLength(0)
  })

  /** `.strict()` fecha a porta: descartar não recebe motivo, razão nem `companyId`. */
  test('campo desconhecido no corpo é recusado, inclusive companyId', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: { companyId: '00000000-0000-4000-8000-0000000000ff' },
        path: DISCARD_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.discardCalls).toHaveLength(0)
  })

  test('identificador fora do formato UUID não chega ao caso de uso', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: {}, path: `${API_NFSE_SERVICE_INVOICES_PATH}/nao-e-uuid/discard` }),
    )

    expect(response.status).toBe(404)
    expect(fixture.discardCalls).toHaveLength(0)
  })

  test('nota fora de rejected/failed devolve o bloqueio de transição como 409 tipado', async () => {
    const fixture = await createNfseInvoicesHttpFixture({
      discardError: new NfseInvoiceTransitionBlockedError(NFSE_TRANSITION_BLOCK.alreadyAuthorized),
    })

    const response = await fixture.handle(invoiceRequest({ body: {}, path: DISCARD_PATH }))
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe(NFSE_TRANSITION_BLOCK.alreadyAuthorized)
  })

  /** Descartar o que já está descartado é o mesmo bloqueio terminal que as outras três ações levam. */
  test('descartar o que já foi descartado devolve 409 com o motivo próprio', async () => {
    const fixture = await createNfseInvoicesHttpFixture({
      discardError: new NfseInvoiceTransitionBlockedError(NFSE_TRANSITION_BLOCK.alreadyDiscarded),
    })

    const response = await fixture.handle(invoiceRequest({ body: {}, path: DISCARD_PATH }))
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe(NFSE_TRANSITION_BLOCK.alreadyDiscarded)
  })
})
