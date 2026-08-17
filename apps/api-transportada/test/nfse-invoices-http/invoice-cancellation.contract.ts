/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  NfseIdempotencyKeyReusedError,
  NfseInvoiceTransitionBlockedError,
} from '../../src/nfse-invoices/domain/nfse-issuance.error'
import { NFSE_TRANSITION_BLOCK } from '../../src/nfse-invoices/domain/nfse-invoice-state.policy'
import { API_NFSE_SERVICE_INVOICES_PATH } from '../../src/shared/api.constant'
import {
  ATTEMPT_ID,
  COMPANY_CONTEXT,
  DOCUMENT_ID,
  IDEMPOTENCY_KEY,
  INVOICE_ID,
  READ_ONLY_PERMISSIONS,
  createNfseInvoicesHttpFixture,
  invoiceRequest,
} from '../fixtures/nfse-invoices-http.fixture'

const CANCEL_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/${INVOICE_ID}/cancel`
const REASON = 'Nota emitida com valor de serviço errado.'
const MOTIVE = '2'
const BODY = { cancellationMotive: MOTIVE, cancellationReason: REASON } as const

describe('nfse service invoice cancellation http', () => {
  /**
   * Quem cancela um documento fiscal é a prefeitura, e ela é chamada pelo worker. `202` é o
   * contrato: a rota aceitou o pedido e já devolveu as NF-e liberadas.
   */
  test('o cancelamento devolve 202 com os documentos liberados', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceRequest({ body: BODY, path: CANCEL_PATH }))
    const body = (await response.json()) as {
      data: {
        attemptId: string
        invoiceId: string
        releasedDocumentIds: readonly string[]
        replayed: boolean
        status: string
      }
    }

    expect(response.status).toBe(202)
    expect(body.data.invoiceId).toBe(INVOICE_ID)
    expect(body.data.attemptId).toBe(ATTEMPT_ID)
    expect(body.data.releasedDocumentIds).toEqual([DOCUMENT_ID])
    expect(body.data.replayed).toBe(false)
    // A resposta já conta o pedido em voo — a tela não pode seguir mostrando `authorized`.
    expect(body.data.status).toBe('cancellation_requested')
  })

  test('a rota propaga motivo, chave de idempotência e correlation-id', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(invoiceRequest({ body: BODY, path: CANCEL_PATH }))

    expect(fixture.cancelCalls).toHaveLength(1)
    expect(fixture.cancelCalls[0]?.cancellationMotive).toBe(MOTIVE)
    expect(fixture.cancelCalls[0]?.cancellationReason).toBe(REASON)
    expect(fixture.cancelCalls[0]?.idempotencyKey).toBe(IDEMPOTENCY_KEY)
    expect(fixture.cancelCalls[0]?.correlationId).toBe('nfse-invoices-http-correlation')
    expect(fixture.cancelCalls[0]?.invoiceId).toBe(INVOICE_ID)
    expect(fixture.cancelCalls[0]?.companyId).toBe(COMPANY_CONTEXT.companyId)
  })

  /** Cancelar é ato próprio: quem emite não necessariamente pode derrubar nota já autorizada. */
  test('cancelar exige nfse.cancel — leitura sozinha não basta', async () => {
    const fixture = await createNfseInvoicesHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(invoiceRequest({ body: BODY, path: CANCEL_PATH }))

    expect(response.status).toBe(403)
    expect(fixture.cancelCalls).toHaveLength(0)
  })

  /** Sem a chave, dois cliques no botão viram dois pedidos de cancelamento na prefeitura. */
  test('cancelar sem chave de idempotência é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: BODY, idempotencyKey: null, path: CANCEL_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.cancelCalls).toHaveLength(0)
  })

  test('motivo ausente é recusado antes do caso de uso', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceRequest({ body: {}, path: CANCEL_PATH }))

    expect(response.status).toBe(400)
    expect(fixture.cancelCalls).toHaveLength(0)
  })

  test('motivo curto demais é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: { ...BODY, cancellationReason: 'erro' }, path: CANCEL_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.cancelCalls).toHaveLength(0)
  })

  /** O código do motivo é o que a prefeitura lê; o texto do operador fica na nota, não no fio. */
  test('cancelar sem o código do motivo é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: { cancellationReason: REASON }, path: CANCEL_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.cancelCalls).toHaveLength(0)
  })

  test('código de motivo em texto livre é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: { ...BODY, cancellationMotive: 'servico nao prestado' },
        path: CANCEL_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.cancelCalls).toHaveLength(0)
  })

  /**
   * O `1` (erro na emissão) existe no vocabulário do provedor e ele **recusa** o cancelamento
   * pedindo substituição. Aceitá-lo aqui liberaria as NF-e e deixaria a nota esperando um retorno
   * que nunca vem.
   */
  test('o código que o provedor recusa não passa da fronteira', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: { ...BODY, cancellationMotive: '1' }, path: CANCEL_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.cancelCalls).toHaveLength(0)
  })

  /** `.strict()` fecha a porta: `companyId` no corpo escolheria a empresa da nota cancelada. */
  test('campo desconhecido no corpo é recusado, inclusive companyId', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: { ...BODY, companyId: '00000000-0000-4000-8000-0000000000ff' },
        path: CANCEL_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.cancelCalls).toHaveLength(0)
  })

  /**
   * O roteador só casa segmento em UUID canônico: id malformado some como 404 antes da rota, igual
   * à nota de outra empresa — o pedido de cancelamento não chega ao caso de uso de nenhum dos dois.
   */
  test('identificador fora do formato UUID não chega ao caso de uso', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: BODY,
        path: `${API_NFSE_SERVICE_INVOICES_PATH}/nao-e-uuid/cancel`,
      }),
    )

    expect(response.status).toBe(404)
    expect(fixture.cancelCalls).toHaveLength(0)
  })

  test('nota fora de autorizada devolve o bloqueio de transição como 409 tipado', async () => {
    const fixture = await createNfseInvoicesHttpFixture({
      cancelError: new NfseInvoiceTransitionBlockedError(NFSE_TRANSITION_BLOCK.notAuthorized),
    })

    const response = await fixture.handle(invoiceRequest({ body: BODY, path: CANCEL_PATH }))
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe(NFSE_TRANSITION_BLOCK.notAuthorized)
  })

  /** Dois cliques em janelas diferentes: o segundo esbarra no pedido que já está com a prefeitura. */
  test('cancelar o que já tem cancelamento em voo devolve 409 com mensagem própria', async () => {
    const fixture = await createNfseInvoicesHttpFixture({
      cancelError: new NfseInvoiceTransitionBlockedError(
        NFSE_TRANSITION_BLOCK.cancellationInFlight,
      ),
    })

    const response = await fixture.handle(invoiceRequest({ body: BODY, path: CANCEL_PATH }))
    const body = (await response.json()) as { error: { code: string; message: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe(NFSE_TRANSITION_BLOCK.cancellationInFlight)
    expect(body.error.message).toContain('cancellation')
  })

  test('a mesma chave com outro motivo devolve 409', async () => {
    const fixture = await createNfseInvoicesHttpFixture({
      cancelError: new NfseIdempotencyKeyReusedError(),
    })

    const response = await fixture.handle(invoiceRequest({ body: BODY, path: CANCEL_PATH }))
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_REUSED')
  })
})
