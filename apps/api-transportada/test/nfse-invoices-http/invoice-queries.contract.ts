/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  NfseFiscalDocumentUnavailableError,
  NfseInvoiceNotFoundError,
} from '../../src/nfse-invoices/domain/nfse-issuance.error'
import { nfseLastIssuancePayloadResponseSchema } from '../../src/nfse-invoices/presentation/nfse-invoices.schema'
import { API_NFSE_SERVICE_INVOICES_PATH } from '../../src/shared/api.constant'
import {
  COMPANY_CONTEXT,
  DETAIL,
  DOCUMENT_ID,
  DOWNLOAD,
  INVOICE_ID,
  LAST_PAYLOAD,
  createNfseInvoicesHttpFixture,
  invoiceReadRequest,
} from '../fixtures/nfse-invoices-http.fixture'

const INVOICE_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/${INVOICE_ID}`
const CURSOR = `2026-08-12T12:00:00.000Z::${INVOICE_ID}`

describe('nfse service invoices listing http', () => {
  test('a listagem devolve as notas e o cursor da próxima página', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceReadRequest(API_NFSE_SERVICE_INVOICES_PATH))
    const body = (await response.json()) as {
      data: readonly { documentCount: number; id: string; status: string }[]
      page: { nextCursor: string | null }
    }

    expect(response.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.id).toBe(INVOICE_ID)
    expect(body.data[0]?.status).toBe('authorized')
    expect(body.data[0]?.documentCount).toBe(1)
    expect(body.page.nextCursor).toBeNull()
  })

  test('a empresa da listagem vem do contexto autenticado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(invoiceReadRequest(API_NFSE_SERVICE_INVOICES_PATH))

    expect(fixture.listCalls[0]?.companyId).toBe(COMPANY_CONTEXT.companyId)
  })

  /** O cursor é decodificado na fronteira: o caso de uso recebe a tupla, nunca a string da URL. */
  test('o cursor chega decodificado ao caso de uso', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(
      invoiceReadRequest(`${API_NFSE_SERVICE_INVOICES_PATH}?cursor=${encodeURIComponent(CURSOR)}`),
    )

    expect(fixture.listCalls[0]?.cursor).toEqual({
      createdAt: '2026-08-12T12:00:00.000Z',
      id: INVOICE_ID,
    })
  })

  test('cursor fora do formato é recusado antes do caso de uso', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceReadRequest(`${API_NFSE_SERVICE_INVOICES_PATH}?cursor=nao-e-cursor`),
    )

    expect(response.status).toBe(400)
    expect(fixture.listCalls).toHaveLength(0)
  })

  test('os filtros de status e tomador viram consulta tipada', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(
      invoiceReadRequest(
        `${API_NFSE_SERVICE_INVOICES_PATH}?statusIn=authorized,cancelled&takerTaxIdEq=12345678000199&limit=10`,
      ),
    )

    expect(fixture.listCalls[0]?.limit).toBe(10)
    expect(fixture.listCalls[0]?.filters).toMatchObject({
      statusIn: ['authorized', 'cancelled'],
      takerTaxIdEq: '12345678000199',
    })
  })

  test('status desconhecido no filtro é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceReadRequest(`${API_NFSE_SERVICE_INVOICES_PATH}?statusIn=inventado`),
    )

    expect(response.status).toBe(400)
    expect(fixture.listCalls).toHaveLength(0)
  })

  /** Parâmetro desconhecido é pedido errado: `companyId=` na query não pode virar filtro ignorado. */
  test('parâmetro de consulta desconhecido é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceReadRequest(
        `${API_NFSE_SERVICE_INVOICES_PATH}?companyId=00000000-0000-4000-8000-0000000000ff`,
      ),
    )

    expect(response.status).toBe(400)
    expect(fixture.listCalls).toHaveLength(0)
  })

  test('limite acima do teto é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceReadRequest(`${API_NFSE_SERVICE_INVOICES_PATH}?limit=500`),
    )

    expect(response.status).toBe(400)
    expect(fixture.listCalls).toHaveLength(0)
  })
})

describe('nfse service invoice detail http', () => {
  test('o detalhe devolve a nota com encargos e motivo do cancelamento', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceReadRequest(INVOICE_PATH))
    const body = (await response.json()) as {
      data: {
        cancellationReason: string | null
        charges: readonly { label: string; ordinal: number }[]
        id: string
        verificationCode: string | null
      }
    }

    expect(response.status).toBe(200)
    expect(body.data.id).toBe(INVOICE_ID)
    expect(body.data.charges).toHaveLength(1)
    expect(body.data.charges[0]?.ordinal).toBe(1)
    expect(body.data.cancellationReason).toBeNull()
    expect(body.data.verificationCode).toBe(DETAIL.verificationCode)
  })

  /**
   * A emissão é automática: sem o estado da entrega no corpo, a nota parada na tela é
   * indistinguível de uma nota esquecida, e o operador procura um botão de transmitir que não existe.
   */
  test('o detalhe devolve o estado da entrega à prefeitura', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceReadRequest(INVOICE_PATH))
    const body = (await response.json()) as {
      data: {
        delivery: {
          attemptCount: number
          lastErrorCause: string | null
          nextAttemptAt: string | null
          status: string
        } | null
      }
    }

    expect(response.status).toBe(200)
    expect(body.data.delivery?.attemptCount).toBe(DETAIL.delivery?.attemptCount)
    expect(body.data.delivery?.status).toBe(DETAIL.delivery?.status ?? '')
    expect(body.data.delivery?.lastErrorCause).toBe(DETAIL.delivery?.lastErrorCause ?? null)
    expect(body.data.delivery?.nextAttemptAt).toBe(DETAIL.delivery?.nextAttemptAt ?? null)
  })

  /**
   * `lastPayload` é o payload congelado da última tentativa — o que o diálogo de reemissão do
   * frontend usa para pré-preencher (spec 042, T013/T014). A forma na resposta é validada pelo
   * schema declarado em `nfse-invoices.schema.ts`, não só por igualdade de objeto.
   */
  test('o detalhe devolve o payload congelado da última tentativa em lastPayload', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceReadRequest(INVOICE_PATH))
    const body = (await response.json()) as { data: { lastPayload: unknown } }
    nfseLastIssuancePayloadResponseSchema.parse(body.data.lastPayload)

    expect(response.status).toBe(200)
    expect(body.data.lastPayload).toEqual(LAST_PAYLOAD)
  })

  /** Nota de outra empresa some: `403` já entregaria que ela existe, e o número dela é sequencial. */
  test('nota de outra empresa é 404, não 403', async () => {
    const fixture = await createNfseInvoicesHttpFixture({
      detailError: new NfseInvoiceNotFoundError(),
    })

    const response = await fixture.handle(invoiceReadRequest(INVOICE_PATH))
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('NFSE_INVOICE_NOT_FOUND')
  })

  /**
   * O roteador só casa segmento em UUID canônico, então id malformado nem chega à rota: some como
   * 404, igual à nota de outra empresa. Uma nota fiscal não deve distinguir "id errado" de
   * "não é sua" — as duas respostas juntas viram um oráculo de existência.
   */
  test('identificador fora do formato UUID não chega ao caso de uso', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceReadRequest(`${API_NFSE_SERVICE_INVOICES_PATH}/nao-e-uuid`),
    )

    expect(response.status).toBe(404)
    expect(fixture.detailCalls).toHaveLength(0)
  })

  test('os vínculos devolvem as NF-e que compõem a nota', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceReadRequest(`${INVOICE_PATH}/documents`))
    const body = (await response.json()) as {
      data: readonly { cancelledAt: string | null; documentId: string; position: number }[]
    }

    expect(response.status).toBe(200)
    expect(body.data[0]?.documentId).toBe(DOCUMENT_ID)
    expect(body.data[0]?.position).toBe(1)
    expect(body.data[0]?.cancelledAt).toBeNull()
  })
})

describe('nfse fiscal document download http', () => {
  /**
   * O XML fiscal nunca passa pelo corpo da resposta: o cliente recebe link assinado de vida curta,
   * e é o storage que entrega os bytes.
   */
  test('o download do XML devolve link assinado, não o documento', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceReadRequest(`${INVOICE_PATH}/xml`))
    const body = (await response.json()) as { data: { expiresAt: string; url: string } }

    expect(response.status).toBe(200)
    expect(body.data).toEqual({ expiresAt: DOWNLOAD.expiresAt, url: DOWNLOAD.url })
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(fixture.downloadCalls[0]?.kind).toBe('xml')
  })

  test('o download do PDF pede o mesmo caminho com outro tipo', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceReadRequest(`${INVOICE_PATH}/pdf`))

    expect(response.status).toBe(200)
    expect(fixture.downloadCalls[0]?.kind).toBe('pdf')
    expect(fixture.downloadCalls[0]?.companyId).toBe(COMPANY_CONTEXT.companyId)
  })

  /** O PDF chega com a autorização: antes disso o pedido é conflito de estado, não recurso ausente. */
  test('documento ainda não arquivado devolve 409 tipado', async () => {
    const fixture = await createNfseInvoicesHttpFixture({
      downloadError: new NfseFiscalDocumentUnavailableError(),
    })

    const response = await fixture.handle(invoiceReadRequest(`${INVOICE_PATH}/pdf`))
    const body = (await response.json()) as { error: { code: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('NFSE_FISCAL_DOCUMENT_UNAVAILABLE')
  })
})
