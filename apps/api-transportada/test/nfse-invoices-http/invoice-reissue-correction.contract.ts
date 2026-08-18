/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { API_NFSE_SERVICE_INVOICES_PATH } from '../../src/shared/api.constant'
import {
  INVOICE_ID,
  createNfseInvoicesHttpFixture,
  invoiceRequest,
} from '../fixtures/nfse-invoices-http.fixture'

const REISSUE_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/${INVOICE_ID}/reissue`

/**
 * T008 é o contrato dos nove campos corrigíveis e dos quatro proibidos — o schema só aprende a ler
 * o corpo no T009 (`nfseInvoiceReissueSchema` continua `.strict({})` até lá).
 */
describe('nfse service invoice reissue correction http', () => {
  test('descrição corrigida no corpo chega ao caso de uso, sem 400', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: { description: 'Serviço de transporte corrigido.' },
        path: REISSUE_PATH,
      }),
    )

    expect(response.status).toBe(202)
    expect(fixture.reissueCalls[0]?.correction).toEqual({
      description: 'Serviço de transporte corrigido.',
    })
  })

  test('issRate corrigida no corpo chega ao caso de uso, sem 400', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: { issRate: '0.060000' }, path: REISSUE_PATH }),
    )

    expect(response.status).toBe(202)
    expect(fixture.reissueCalls[0]?.correction).toEqual({ issRate: '0.060000' })
  })

  test('serviceAmount no corpo é recusado com 400', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: { serviceAmount: '99999.0000' }, path: REISSUE_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.reissueCalls).toHaveLength(0)
  })

  test('issAmount no corpo é recusado com 400', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: { issAmount: '999.0000' }, path: REISSUE_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.reissueCalls).toHaveLength(0)
  })

  test('taker no corpo é recusado com 400', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: { taker: '0' }, path: REISSUE_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.reissueCalls).toHaveLength(0)
  })

  test('documents no corpo é recusado com 400', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: { documents: [] }, path: REISSUE_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.reissueCalls).toHaveLength(0)
  })
})
