/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { API_NFSE_SERVICE_INVOICES_PATH } from '../../src/shared/api.constant'
import {
  BLOCKED_DOCUMENT_ID,
  COMPANY_CONTEXT,
  DOCUMENT_ID,
  IDEMPOTENCY_KEY,
  INVOICE_ID,
  OTHER_DOCUMENT_ID,
  PROFILE_ID,
  READ_ONLY_PERMISSIONS,
  createNfseInvoicesHttpFixture,
  invoiceRequest,
} from '../fixtures/nfse-invoices-http.fixture'

const PREVIEW_PATH = `${API_NFSE_SERVICE_INVOICES_PATH}/preview`

const SELECTION = {
  documentIds: [DOCUMENT_ID, OTHER_DOCUMENT_ID],
  profileId: PROFILE_ID,
} as const

describe('nfse service invoices http', () => {
  test('a prévia devolve as notas projetadas e os bloqueios como dado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(invoiceRequest({ body: SELECTION, path: PREVIEW_PATH }))
    const body = (await response.json()) as {
      data: {
        blocked: readonly {
          documentId: string
          number: null | string
          reason: string
          series: null | string
        }[]
        invoices: readonly { profileId: string; serviceAmount: string }[]
      }
    }

    expect(response.status).toBe(200)
    expect(body.data.invoices).toHaveLength(1)
    expect(body.data.invoices[0]?.profileId).toBe(PROFILE_ID)
    expect(body.data.invoices[0]?.serviceAmount).toBe('850.00')
    expect(body.data.blocked).toEqual([
      {
        documentId: BLOCKED_DOCUMENT_ID,
        number: '000000456',
        reason: 'NFSE_DOCUMENT_ALREADY_LINKED',
        series: '001',
      },
    ])
  })

  /** A prévia não emite nada: ela precisa caber em quem só lê, senão a tela pede permissão demais. */
  test('a prévia é acessível a quem só tem leitura', async () => {
    const fixture = await createNfseInvoicesHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(invoiceRequest({ body: SELECTION, path: PREVIEW_PATH }))

    expect(response.status).toBe(200)
  })

  /**
   * A prefeitura é chamada pelo worker. `202` é o contrato: a rota aceitou o pedido, o número da
   * nota ainda não existe.
   */
  test('a criação devolve 202 com o resumo do pedido aceito', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({ body: SELECTION, path: API_NFSE_SERVICE_INVOICES_PATH }),
    )
    const body = (await response.json()) as {
      data: { invoiceId: string; replayed: boolean; status: string }
    }

    expect(response.status).toBe(202)
    expect(body.data.invoiceId).toBe(INVOICE_ID)
    expect(body.data.status).toBe('requested')
    expect(body.data.replayed).toBe(false)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('a criação propaga a chave de idempotência e o correlation-id para o caso de uso', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(invoiceRequest({ body: SELECTION, path: API_NFSE_SERVICE_INVOICES_PATH }))

    expect(fixture.createCalls).toHaveLength(1)
    expect(fixture.createCalls[0]?.idempotencyKey).toBe(IDEMPOTENCY_KEY)
    expect(fixture.createCalls[0]?.correlationId).toBe('nfse-invoices-http-correlation')
  })

  /** `idempotency-key` é obrigatório: sem ela, uma repetição de rede emitiria a nota duas vezes. */
  test('a criação sem chave de idempotência é recusada', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: SELECTION,
        idempotencyKey: null,
        path: API_NFSE_SERVICE_INVOICES_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.createCalls).toHaveLength(0)
  })

  test('emitir exige nfse.issue — leitura sozinha não basta', async () => {
    const fixture = await createNfseInvoicesHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(
      invoiceRequest({ body: SELECTION, path: API_NFSE_SERVICE_INVOICES_PATH }),
    )

    expect(response.status).toBe(403)
    expect(fixture.createCalls).toHaveLength(0)
  })

  /**
   * `companyId` vem do contexto autenticado. Aceitar o campo no corpo deixaria o cliente escolher a
   * empresa da nota, e `.strict()` é o que fecha essa porta.
   */
  test('campo desconhecido no corpo é recusado, inclusive companyId', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: { ...SELECTION, companyId: '00000000-0000-4000-8000-0000000000ff' },
        path: API_NFSE_SERVICE_INVOICES_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.createCalls).toHaveLength(0)
  })

  test('a empresa da nota vem do contexto autenticado, nunca do corpo', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(invoiceRequest({ body: SELECTION, path: API_NFSE_SERVICE_INVOICES_PATH }))

    expect(fixture.createCalls[0]?.companyId).toBe(COMPANY_CONTEXT.companyId)
    expect(fixture.createCalls[0]?.userId).toBe(COMPANY_CONTEXT.userId)
  })

  test('seleção vazia é recusada antes de chegar ao caso de uso', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: { documentIds: [], profileId: PROFILE_ID },
        path: API_NFSE_SERVICE_INVOICES_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.createCalls).toHaveLength(0)
  })

  /**
   * O período é digitado pelo operador e entra no texto que a prefeitura lê: a rota o transporta
   * como veio, sem inferir janela nenhuma a partir das notas.
   */
  test('o período digitado chega ao caso de uso como veio', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(
      invoiceRequest({
        body: { ...SELECTION, period: '03-08 a 07-08-2026' },
        path: API_NFSE_SERVICE_INVOICES_PATH,
      }),
    )

    expect(fixture.createCalls[0]?.period).toBe('03-08 a 07-08-2026')
  })

  test('pedido sem período não inventa um', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    await fixture.handle(invoiceRequest({ body: SELECTION, path: PREVIEW_PATH }))

    expect(fixture.previewCalls[0]?.period).toBeUndefined()
  })

  /** Um teto existe porque o período entra no texto: sem ele a descrição estoura o limite do perfil. */
  test('período acima do teto é recusado na fronteira', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: { ...SELECTION, period: 'a'.repeat(61) },
        path: API_NFSE_SERVICE_INVOICES_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.createCalls).toHaveLength(0)
  })

  test('documento fora do formato UUID é recusado', async () => {
    const fixture = await createNfseInvoicesHttpFixture()

    const response = await fixture.handle(
      invoiceRequest({
        body: { documentIds: ['nao-e-uuid'], profileId: PROFILE_ID },
        path: PREVIEW_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.previewCalls).toHaveLength(0)
  })

  /** A resposta de replay é a mesma do pedido original, só com o aviso de que nada foi criado. */
  test('replay devolve 202 com replayed verdadeiro', async () => {
    const fixture = await createNfseInvoicesHttpFixture({
      summary: {
        attemptId: '00000000-0000-4000-8000-0000000000c1',
        documentIds: [DOCUMENT_ID],
        invoiceId: INVOICE_ID,
        replayed: true,
        requestedAt: '2026-08-12T12:00:00.000Z',
        status: 'requested',
      },
    })

    const response = await fixture.handle(
      invoiceRequest({ body: SELECTION, path: API_NFSE_SERVICE_INVOICES_PATH }),
    )
    const body = (await response.json()) as { data: { replayed: boolean } }

    expect(response.status).toBe(202)
    expect(body.data.replayed).toBe(true)
  })
})
