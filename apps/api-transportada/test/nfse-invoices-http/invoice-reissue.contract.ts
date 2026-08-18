/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { NfseInvoiceTransitionBlockedError } from '../../src/nfse-invoices/domain/nfse-issuance.error'
import { NFSE_TRANSITION_BLOCK } from '../../src/nfse-invoices/domain/nfse-invoice-state.policy'
import { API_NFSE_SERVICE_INVOICES_PATH } from '../../src/shared/api.constant'
import {
  ATTEMPT_ID,
  COMPANY_CONTEXT,
  INVOICE_ID,
  READ_ONLY_PERMISSIONS,
  createNfseInvoicesHttpFixture,
  invoiceRequest,
  invoiceRequestWithoutBody,
} from '../fixtures/nfse-invoices-http.fixture'

const REISSUE_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/${INVOICE_ID}/reissue`

describe('nfse service invoice reissue http', () => {
  /**
   * Sem corpo, a reemissão reaproveita o payload congelado tal como está — o mesmo que a empresa
   * já aprovou na prévia. `attemptNumber` incrementa e `payloadSha256` é o mesmo da tentativa anterior.
   */
  test('a reemissão sem corpo devolve 202 com a nova tentativa', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceRequest({ body: {}, path: REISSUE_PATH }))
    const body = (await response.json()) as {
      data: {
        attemptId: string
        attemptNumber: number
        invoiceId: string
        payloadSha256: string
        replayed: boolean
        status: string
      }
    }

    expect(response.status).toBe(202)
    expect(body.data.invoiceId).toBe(INVOICE_ID)
    expect(body.data.attemptId).toBe(ATTEMPT_ID)
    expect(body.data.attemptNumber).toBe(2)
    expect(body.data.payloadSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(body.data.replayed).toBe(false)
    expect(body.data.status).toBe('issuing')
  })

  /**
   * O teste acima diz "sem corpo" mandando `{}` com `content-type` — é outro pedido. Reemitir sem
   * correção, do jeito que o cliente monta, não leva body nem cabeçalho, e precisa ser aceito.
   */
  test('a reemissão sem corpo nenhum é aceita, não recusada por content-type', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceRequestWithoutBody({ path: REISSUE_PATH }))

    expect(response.status).toBe(202)
    expect(fixture.reissueCalls).toHaveLength(1)
    expect(fixture.reissueCalls[0]?.invoiceId).toBe(INVOICE_ID)
  })


  test('a rota propaga chave de idempotência, correlation-id e empresa', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(invoiceRequest({ body: {}, path: REISSUE_PATH }))

    expect(fixture.reissueCalls).toHaveLength(1)
    expect(fixture.reissueCalls[0]?.idempotencyKey).toBeDefined()
    expect(fixture.reissueCalls[0]?.correlationId).toBe('nfse-invoices-http-correlation')
    expect(fixture.reissueCalls[0]?.invoiceId).toBe(INVOICE_ID)
    expect(fixture.reissueCalls[0]?.companyId).toBe(COMPANY_CONTEXT.companyId)
  })

  /** Reemitir volta a passar pela emissão: a permissão é a mesma da criação, não a do cancelamento. */
  test('reemitir exige nfse.issue — leitura sozinha não basta', async () => {
    const fixture = await createNfseInvoicesHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(invoiceRequest({ body: {}, path: REISSUE_PATH }))

    expect(response.status).toBe(403)
    expect(fixture.reissueCalls).toHaveLength(0)
  })

  test('reemitir sem chave de idempotência é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: {}, idempotencyKey: null, path: REISSUE_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.reissueCalls).toHaveLength(0)
  })

  /** T006 é a reemissão sem correção — o corpo com campos vem no T008. */
  test('campo desconhecido no corpo é recusado, inclusive companyId', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: { companyId: '00000000-0000-4000-8000-0000000000ff' },
        path: REISSUE_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.reissueCalls).toHaveLength(0)
  })

  test('identificador fora do formato UUID não chega ao caso de uso', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: {}, path: `${API_NFSE_SERVICE_INVOICES_PATH}/nao-e-uuid/reissue` }),
    )

    expect(response.status).toBe(404)
    expect(fixture.reissueCalls).toHaveLength(0)
  })

  test('nota autorizada devolve o bloqueio de transição como 409 tipado', async () => {
    const fixture = await createNfseInvoicesHttpFixture({
      reissueError: new NfseInvoiceTransitionBlockedError(NFSE_TRANSITION_BLOCK.alreadyAuthorized),
    })

    const response = await fixture.handle(invoiceRequest({ body: {}, path: REISSUE_PATH }))
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe(NFSE_TRANSITION_BLOCK.alreadyAuthorized)
  })

  /** Reemitir o que já foi descartado é o mesmo bloqueio terminal que as outras ações levam. */
  test('nota descartada devolve 409 com o motivo próprio', async () => {
    const fixture = await createNfseInvoicesHttpFixture({
      reissueError: new NfseInvoiceTransitionBlockedError(NFSE_TRANSITION_BLOCK.alreadyDiscarded),
    })

    const response = await fixture.handle(invoiceRequest({ body: {}, path: REISSUE_PATH }))
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe(NFSE_TRANSITION_BLOCK.alreadyDiscarded)
  })
})
