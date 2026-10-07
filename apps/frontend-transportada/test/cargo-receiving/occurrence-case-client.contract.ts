/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b: o cliente HTTP da tratativa da avaria de recebimento — as seis ações de
 * `/trip-occurrences/:id/case/*` e o acerto (`PUT|GET …/case/settlement`) sobre `occurrence.id`, com o corpo EXATO
 * que a API lê (`occurrence-case.schema.ts`, `occurrence-settlement.schema.ts`: `.strict()`, chave a mais é 400).
 * O código do erro sobe como veio — é por ele que a tela escolhe o texto. `fetch` injetado, nenhuma rede.
 */
import { describe, expect, test } from 'bun:test'

import { createCargoOccurrenceCaseClient } from '@/modules/cargo-receiving/shared/cargoOccurrenceCaseClient.service'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

type Captured = { headers: Headers; json: unknown; method: string; url: URL }

function harness(respond: (captured: Captured) => Response) {
  const calls: Captured[] = []
  const client = createCargoOccurrenceCaseClient({
    apiUrl: 'https://api.test',
    fetch: async (input) => {
      const request = input as Request
      const text = await request.clone().text()
      const captured: Captured = {
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

const OCCURRENCE = '00000000-0000-4000-8000-0000002374a1'
const BASE = `/trip-occurrences/${OCCURRENCE}/case`
const CHANGED = { data: { kind: 'changed', status: 'under_review' } }

describe('as seis ações da tratativa', () => {
  const CASES = [
    { action: 'review', body: undefined, path: `${BASE}/review` },
    { action: 'submit', body: undefined, path: `${BASE}/contractor-submission` },
    { action: 'close', body: undefined, path: `${BASE}/closure` },
  ] as const

  for (const { action, body, path } of CASES) {
    test(`${action}: POST ${path.replace(OCCURRENCE, ':id')} sem corpo (o schema é \`{}\` estrito)`, async () => {
      const { calls, client } = harness(() => json(CHANGED))

      const result = await client.changeCase({ action, occurrenceId: OCCURRENCE })

      expect(calls[0]?.method).toBe('POST')
      expect(calls[0]?.url.pathname).toBe(path)
      expect(calls[0]?.json).toBe(body)
      expect(calls[0]?.headers.get('authorization')).toBe('Bearer token-sintetico')
      expect(result).toEqual({ kind: 'changed', status: 'under_review' })
    })
  }

  test('devolver ao galpão e cancelar mandam só `{ note }`', async () => {
    const { calls, client } = harness(() => json(CHANGED))

    await client.changeCase({
      action: 'warehouse-return',
      note: 'voltou ao estoque',
      occurrenceId: OCCURRENCE,
    })
    await client.changeCase({
      action: 'cancel',
      note: 'aberta por engano',
      occurrenceId: OCCURRENCE,
    })

    expect(calls.map((call) => call.url.pathname)).toEqual([
      `${BASE}/warehouse-return`,
      `${BASE}/cancel`,
    ])
    expect(calls[0]?.json).toEqual({ note: 'voltou ao estoque' })
    expect(calls[1]?.json).toEqual({ note: 'aberta por engano' })
  })

  test('a decisão do escritório manda `{ kind, note }` — nada além', async () => {
    const { calls, client } = harness(() => json(CHANGED))

    await client.changeCase({
      action: 'decide',
      kind: 'goods_paid',
      note: 'a transportadora paga',
      occurrenceId: OCCURRENCE,
    })

    expect(calls[0]?.url.pathname).toBe(`${BASE}/decision`)
    expect(calls[0]?.json).toEqual({ kind: 'goods_paid', note: 'a transportadora paga' })
  })

  test('repetir a ação converge: `unchanged` é sucesso, não erro', async () => {
    const { client } = harness(() => json({ data: { kind: 'unchanged', status: 'closed' } }))

    expect(await client.changeCase({ action: 'close', occurrenceId: OCCURRENCE })).toEqual({
      kind: 'unchanged',
      status: 'closed',
    })
  })

  test('o id da ocorrência vai codificado no caminho', async () => {
    const { calls, client } = harness(() => json(CHANGED))

    await client.changeCase({ action: 'review', occurrenceId: 'a/b' })

    expect(calls[0]?.url.pathname).toBe('/trip-occurrences/a%2Fb/case/review')
  })
})

describe('o código da recusa sobe como veio, e o 429 também', () => {
  const REFUSALS = [
    { code: 'OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED', status: 409 },
    { code: 'OCCURRENCE_CASE_NOTE_REQUIRED', status: 422 },
    { code: 'OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS', status: 422 },
    { code: 'OCCURRENCE_CASE_NOT_FOUND', status: 404 },
    { code: 'TOO_MANY_REQUESTS', status: 429 },
  ] as const

  for (const { code, status } of REFUSALS) {
    test(`${status} ${code}`, async () => {
      const { client } = harness(() => json({ error: { code, message: 'x' } }, status))

      const failure = await client
        .changeCase({ action: 'close', occurrenceId: OCCURRENCE })
        .catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(CargoReceivingRequestError)
      expect((failure as Error).message).toBe(code)
    })
  }

  test('resposta de sucesso fora do formato é recusada, nunca aceita calada', async () => {
    for (const body of [
      {},
      { data: {} },
      { data: { kind: 'changed' } },
      { data: { kind: 'maybe', status: 'closed' } },
      { data: { kind: 'changed', status: 'inventado' } },
    ]) {
      const { client } = harness(() => json(body))

      const failure = await client
        .changeCase({ action: 'close', occurrenceId: OCCURRENCE })
        .catch((error: unknown) => error)

      expect((failure as Error).message).toBe('RESPONSE_INVALID')
    }
  })
})

describe('o acerto por item', () => {
  const ITEM = {
    amount: '120.0000',
    amountSource: 'manual',
    payerKind: 'carrier',
    productCode: 'P-100',
  } as const

  test('ler é GET sobre `case/settlement` e devolve itens e total', async () => {
    const { calls, client } = harness(() =>
      json({ data: { items: [{ ...ITEM, reimbursedAt: null }], total: '120.0000' } }),
    )

    const view = await client.readSettlement(OCCURRENCE)

    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url.pathname).toBe(`${BASE}/settlement`)
    expect(view.total).toBe('120.0000')
    expect(view.items).toHaveLength(1)
    expect(view.items[0]).toMatchObject({ payerKind: 'carrier', productCode: 'P-100' })
  })

  test('gravar é PUT com `{ items }` e substitui a lista inteira', async () => {
    const { calls, client } = harness(() => json({ data: { items: [ITEM], total: '120.0000' } }))

    const result = await client.recordSettlement({ items: [ITEM], occurrenceId: OCCURRENCE })

    expect(calls[0]?.method).toBe('PUT')
    expect(calls[0]?.url.pathname).toBe(`${BASE}/settlement`)
    expect(calls[0]?.json).toEqual({ items: [ITEM] })
    expect(result.total).toBe('120.0000')
  })

  test('o acerto fora do formato é recusado', async () => {
    for (const body of [
      { data: { items: 'x', total: '1' } },
      { data: { items: [{}], total: '1' } },
      { data: { items: [] } },
    ]) {
      const { client } = harness(() => json(body))

      const failure = await client.readSettlement(OCCURRENCE).catch((error: unknown) => error)

      expect((failure as Error).message).toBe('RESPONSE_INVALID')
    }
  })

  test('a recusa do acerto nomeia o motivo pelo código', async () => {
    const { client } = harness(() =>
      json({ error: { code: 'OCCURRENCE_SETTLEMENT_ITEM_UNKNOWN', message: 'x' } }, 422),
    )

    const failure = await client
      .recordSettlement({ items: [ITEM], occurrenceId: OCCURRENCE })
      .catch((error: unknown) => error)

    expect((failure as Error).message).toBe('OCCURRENCE_SETTLEMENT_ITEM_UNKNOWN')
  })
})
