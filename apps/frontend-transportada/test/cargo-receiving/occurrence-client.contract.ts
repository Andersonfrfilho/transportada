/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3: o cliente HTTP da avaria e da devolução — caminho, verbo, corpo, cabeçalho e o multipart
 * de cada rota (`cargo-arrival-occurrence.routes.ts`), e o erro que carrega o código e os `details` do
 * servidor (`web.md` §11). `fetch` injetado, nenhuma rede.
 */
import { describe, expect, test } from 'bun:test'

import { createCargoOccurrenceClient } from '@/modules/cargo-receiving/shared/cargoOccurrenceClient.service'
import { buildOccurrenceFormData } from '@/modules/cargo-receiving/shared/cargoOccurrenceForm.validation'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import {
  buildOccurrence,
  buildOccurrencesView,
  buildProduct,
  DAMAGE_TYPE_ID,
  RECEIVING_TYPES,
} from '../fixtures/cargoOccurrence.fixture'
import { ARRIVAL_ID, documentIdOf } from '../fixtures/cargoReceiving.fixture'

type Captured = { form: FormData | undefined; headers: Headers; json: unknown; method: string; url: URL }

function harness(respond: (captured: Captured) => Response | Promise<Response>) {
  const calls: Captured[] = []
  const client = createCargoOccurrenceClient({
    apiUrl: 'https://api.test',
    fetch: async (input) => {
      const request = input as Request
      const isMultipart = (request.headers.get('content-type') ?? '').startsWith('multipart/')
      const text = isMultipart ? '' : await request.clone().text()
      const captured: Captured = {
        form: isMultipart ? await request.clone().formData() : undefined,
        headers: request.headers,
        json: text === '' ? undefined : (JSON.parse(text) as unknown),
        method: request.method,
        url: new URL(request.url),
      }
      calls.push(captured)
      return respond(captured)
    },
    getAccessToken: () => Promise.resolve('token-sintetico'),
  })
  return { calls, client }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status })

const DOCUMENT = documentIdOf(1001)
const BASE = `/cargo-arrivals/${ARRIVAL_ID}`
const OCCURRENCE = buildOccurrence({ id: 'occ-1', nfeDocumentId: DOCUMENT })

function buildForm(): FormData {
  return buildOccurrenceFormData({
    draft: {
      itemsByCode: new Map([
        ['P-100', { quantity: '2,5', unit: 'CX' }],
        ['P-200', { quantity: '', unit: 'KG' }],
      ]),
      note: 'Caixa amassada',
      photo: {
        id: 'photo-1',
        original: new Blob(['jpeg'], { type: 'image/jpeg' }),
        thumbnail: new Blob(['mini'], { type: 'image/jpeg' }),
      },
      typeId: DAMAGE_TYPE_ID,
    },
  })
}

describe('as leituras', () => {
  test('os tipos de recebimento vêm de `/cargo-arrivals/occurrence-types`', async () => {
    const { calls, client } = harness(() => json({ data: RECEIVING_TYPES }))

    const types = await client.listTypes()

    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url.pathname).toBe('/cargo-arrivals/occurrence-types')
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer token-sintetico')
    expect(types).toHaveLength(3)
  })

  test('as ocorrências e as marcações vêm da rota da chegada, sem query', async () => {
    const { calls, client } = harness(() => json({ data: buildOccurrencesView() }))

    await client.listOccurrences(ARRIVAL_ID)

    expect(calls[0]?.url.pathname).toBe(`${BASE}/occurrences`)
    expect(calls[0]?.url.search).toBe('')
  })

  test('os itens da nota vêm da rota própria, pelo id da NF-e', async () => {
    const { calls, client } = harness(() => json({ data: [buildProduct({ code: 'P-1' })] }))

    const products = await client.listDocumentProducts({ arrivalId: ARRIVAL_ID, documentId: DOCUMENT })

    expect(calls[0]?.url.pathname).toBe(`${BASE}/documents/${DOCUMENT}/products`)
    expect(products[0]?.code).toBe('P-1')
  })
})

describe('abrir a avaria', () => {
  test('multipart com os campos do servidor, itens repetidos e alinhados, e a chave no cabeçalho', async () => {
    const { calls, client } = harness(() => json({ data: OCCURRENCE }, 201))

    const result = await client.registerOccurrence({
      arrivalId: ARRIVAL_ID,
      documentId: DOCUMENT,
      form: buildForm(),
      idempotencyKey: 'tentativa-0000000000001',
    })

    const call = calls[0]
    expect(call?.method).toBe('POST')
    expect(call?.url.pathname).toBe(`${BASE}/documents/${DOCUMENT}/occurrences`)
    expect(call?.headers.get('idempotency-key')).toBe('tentativa-0000000000001')
    expect(call?.headers.get('content-type')).toStartWith('multipart/form-data; boundary=')
    expect(call?.form?.get('occurrenceTypeId')).toBe(DAMAGE_TYPE_ID)
    expect(call?.form?.get('note')).toBe('Caixa amassada')
    expect(call?.form?.getAll('productCodes')).toEqual(['P-100', 'P-200'])
    expect(call?.form?.getAll('productQuantities')).toEqual(['2.5', ''])
    expect(call?.form?.getAll('productQuantityUnits')).toEqual(['CX', ''])
    expect(call?.form?.get('file')).toBeInstanceOf(File)
    expect(call?.form?.getAll('thumbnail')).toHaveLength(1)
    expect([...(call?.form?.keys() ?? [])].sort()).toEqual(
      [
        'file',
        'note',
        'occurrenceTypeId',
        'productCodes',
        'productCodes',
        'productQuantities',
        'productQuantities',
        'productQuantityUnits',
        'productQuantityUnits',
        'thumbnail',
      ].sort(),
    )
    expect(result.isReplay).toBe(false)
  })

  test('nunca manda empresa, etapa ou canal: isso é do contexto e do tipo', async () => {
    const { calls, client } = harness(() => json({ data: OCCURRENCE }, 201))

    await client.registerOccurrence({
      arrivalId: ARRIVAL_ID,
      documentId: DOCUMENT,
      form: buildForm(),
      idempotencyKey: 'tentativa-0000000000001',
    })

    for (const forbidden of ['companyId', 'stage', 'channel', 'productCode']) {
      expect(calls[0]?.form?.has(forbidden)).toBe(false)
    }
  })

  test('200 é o reenvio idempotente: a mesma ocorrência, sem erro', async () => {
    const { client } = harness(() => json({ data: OCCURRENCE }, 200))

    const result = await client.registerOccurrence({
      arrivalId: ARRIVAL_ID,
      documentId: DOCUMENT,
      form: buildForm(),
      idempotencyKey: 'tentativa-0000000000001',
    })

    expect(result.isReplay).toBe(true)
    expect(result.occurrence.id).toBe('occ-1')
  })

  test('a janela fechada sobe com o código estável do servidor, sem trocá-lo por genérico', async () => {
    const { client } = harness(() =>
      json({ error: { code: 'CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED', message: 'closed' } }, 422),
    )

    const failure = await client
      .registerOccurrence({
        arrivalId: ARRIVAL_ID,
        documentId: DOCUMENT,
        form: buildForm(),
        idempotencyKey: 'tentativa-0000000000001',
      })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(CargoReceivingRequestError)
    expect((failure as Error).message).toBe('CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED')
  })

  test('os `details` do servidor chegam inteiros ao erro', async () => {
    const { client } = harness(() =>
      json(
        {
          error: {
            code: 'INVALID_REQUEST',
            details: [
              { field: 'occurrenceTypeId', message: 'Invalid' },
              { field: 'productCodes', message: 'Choose at least one item' },
            ],
            message: 'x',
          },
        },
        400,
      ),
    )

    const failure = (await client
      .registerOccurrence({
        arrivalId: ARRIVAL_ID,
        documentId: DOCUMENT,
        form: buildForm(),
        idempotencyKey: 'tentativa-0000000000001',
      })
      .catch((error: unknown) => error)) as CargoReceivingRequestError

    expect(failure.details.map((detail) => detail.field)).toEqual(['occurrenceTypeId', 'productCodes'])
  })
})

describe('marcar, desfazer e concluir a devolução', () => {
  const result = (state: string, occurrenceId: string | null) => ({
    data: { documentId: DOCUMENT, outcome: 'changed', returnOccurrenceId: occurrenceId, returnToContractor: state },
  })

  test('marcar manda a ocorrência de origem e a observação em JSON', async () => {
    const { calls, client } = harness(() => json(result('marked', 'occ-1')))

    const marked = await client.changeReturn({
      action: 'mark',
      arrivalId: ARRIVAL_ID,
      documentId: DOCUMENT,
      note: 'Contratante autorizou',
      occurrenceId: 'occ-1',
    })

    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url.pathname).toBe(`${BASE}/documents/${DOCUMENT}/return-mark`)
    expect(calls[0]?.json).toEqual({ note: 'Contratante autorizou', occurrenceId: 'occ-1' })
    expect(marked.returnToContractor).toBe('marked')
  })

  test('desfazer e concluir mandam só a observação, e cada um vai na sua rota', async () => {
    const { calls, client } = harness(() => json(result('none', null)))

    await client.changeReturn({ action: 'unmark', arrivalId: ARRIVAL_ID, documentId: DOCUMENT, note: '' })
    await client.changeReturn({ action: 'complete', arrivalId: ARRIVAL_ID, documentId: DOCUMENT, note: 'Saiu' })

    expect(calls[0]?.url.pathname).toBe(`${BASE}/documents/${DOCUMENT}/return-unmark`)
    expect(calls[0]?.json).toEqual({ note: '' })
    expect(calls[1]?.url.pathname).toBe(`${BASE}/documents/${DOCUMENT}/return-complete`)
    expect(calls[1]?.json).toEqual({ note: 'Saiu' })
  })

  test('403 e 409 sobem com o código do servidor', async () => {
    const { client } = harness((captured) =>
      captured.url.pathname.endsWith('return-unmark')
        ? json({ error: { code: 'FORBIDDEN', message: 'no' } }, 403)
        : json({ error: { code: 'CARGO_ARRIVAL_RETURN_DECISION_PENDING', message: 'wait' } }, 409),
    )

    const forbidden = await client
      .changeReturn({ action: 'unmark', arrivalId: ARRIVAL_ID, documentId: DOCUMENT, note: '' })
      .catch((error: unknown) => error)
    const pending = await client
      .changeReturn({ action: 'complete', arrivalId: ARRIVAL_ID, documentId: DOCUMENT, note: '' })
      .catch((error: unknown) => error)

    expect((forbidden as Error).message).toBe('FORBIDDEN')
    expect((pending as Error).message).toBe('CARGO_ARRIVAL_RETURN_DECISION_PENDING')
  })
})
