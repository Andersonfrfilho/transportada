/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  NfseInvoiceTransitionBlockedError,
  NfseProviderDocumentAlreadyLinkedError,
} from '../../src/nfse-invoices/domain/nfse-issuance.error'
import { NFSE_TRANSITION_BLOCK } from '../../src/nfse-invoices/domain/nfse-invoice-state.policy'
import { API_NFSE_SERVICE_INVOICES_PATH } from '../../src/shared/api.constant'
import {
  COMPANY_CONTEXT,
  INVOICE_ID,
  READ_ONLY_PERMISSIONS,
  createNfseInvoicesHttpFixture,
  invoiceRequest,
} from '../fixtures/nfse-invoices-http.fixture'

const LINK_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/${INVOICE_ID}/external-link`
const VALID_BODY = { providerDocumentId: '4821' }

describe('nfse service invoice external link http', () => {
  test('o vínculo devolve 202 com a nota aguardando autorização', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceRequest({ body: VALID_BODY, path: LINK_PATH }))
    const body = (await response.json()) as {
      data: { attemptId: string; invoiceId: string; replayed: boolean; status: string }
    }

    expect(response.status).toBe(202)
    expect(body.data.invoiceId).toBe(INVOICE_ID)
    expect(body.data.replayed).toBe(false)
    expect(body.data.status).toBe('pending_authorization')
    expect(body.data.attemptId).toBeDefined()
  })

  test('a rota propaga id_nota, chave de idempotência, correlation-id e empresa do contexto', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(invoiceRequest({ body: VALID_BODY, path: LINK_PATH }))

    expect(fixture.linkCalls).toHaveLength(1)
    expect(fixture.linkCalls[0]?.providerDocumentId).toBe('4821')
    expect(fixture.linkCalls[0]?.idempotencyKey).toBeDefined()
    expect(fixture.linkCalls[0]?.correlationId).toBe('nfse-invoices-http-correlation')
    expect(fixture.linkCalls[0]?.invoiceId).toBe(INVOICE_ID)
    expect(fixture.linkCalls[0]?.companyId).toBe(COMPANY_CONTEXT.companyId)
  })

  test('vincular exige nfse.issue — leitura sozinha não basta', async () => {
    const fixture = await createNfseInvoicesHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(invoiceRequest({ body: VALID_BODY, path: LINK_PATH }))

    expect(response.status).toBe(403)
    expect(fixture.linkCalls).toHaveLength(0)
  })

  test('vincular sem chave de idempotência é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: VALID_BODY, idempotencyKey: null, path: LINK_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.linkCalls).toHaveLength(0)
  })

  test('campo desconhecido no corpo é recusado, inclusive companyId', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: { ...VALID_BODY, companyId: '00000000-0000-4000-8000-0000000000ff' },
        path: LINK_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.linkCalls).toHaveLength(0)
  })

  test.each([
    [{}],
    [{ providerDocumentId: '48a1' }],
    [{ providerDocumentId: '' }],
    [{ providerDocumentId: 4821 }],
    [{ providerDocumentId: '1'.repeat(21) }],
  ])('corpo inválido %j é recusado', async (body) => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceRequest({ body, path: LINK_PATH }))

    expect(response.status).toBe(400)
    expect(fixture.linkCalls).toHaveLength(0)
  })

  test('identificador fora do formato UUID não chega ao caso de uso', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: VALID_BODY,
        path: `${API_NFSE_SERVICE_INVOICES_PATH}/nao-e-uuid/external-link`,
      }),
    )

    expect(response.status).toBe(404)
    expect(fixture.linkCalls).toHaveLength(0)
  })

  test('nota fora de rejected/failed devolve o bloqueio de transição como 409 tipado', async () => {
    const fixture = await createNfseInvoicesHttpFixture({
      linkError: new NfseInvoiceTransitionBlockedError(NFSE_TRANSITION_BLOCK.alreadyAuthorized),
    })

    const response = await fixture.handle(invoiceRequest({ body: VALID_BODY, path: LINK_PATH }))
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe(NFSE_TRANSITION_BLOCK.alreadyAuthorized)
  })

  test('id_nota já vinculado a outra nota devolve 409 tipado', async () => {
    const fixture = await createNfseInvoicesHttpFixture({
      linkError: new NfseProviderDocumentAlreadyLinkedError(),
    })

    const response = await fixture.handle(invoiceRequest({ body: VALID_BODY, path: LINK_PATH }))
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('NFSE_PROVIDER_DOCUMENT_ALREADY_LINKED')
  })
})
