/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4: o cliente HTTP da prévia — caminho, verbo, corpo e cabeçalho de cada rota
 * (`cargo-preview.routes.ts` e `cargo-preview-action.routes.ts` da API), o envio multipart com a chave de
 * idempotência, 201 × 200 e o erro que carrega o código e os `details`. `fetch` injetado, nenhuma rede.
 */
import { describe, expect, test } from 'bun:test'

import { createCargoPreviewClient } from '@/modules/cargo-receiving/shared/cargoPreviewClient.service'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { ALFA_ID, documentIdOf } from '../fixtures/cargoReceiving.fixture'
import {
  buildPreviewDetail,
  buildPreviewSummary,
  itemIdOf,
  PREVIEW_ID,
} from '../fixtures/cargoPreview.fixture'

type Captured = {
  body: string
  form: FormData | undefined
  headers: Headers
  method: string
  url: URL
}

function harness(respond: (captured: Captured) => Response | Promise<Response>) {
  const calls: Captured[] = []
  const client = createCargoPreviewClient({
    apiUrl: 'https://api.test',
    fetch: async (input) => {
      const request = input as Request
      const isForm = (request.headers.get('content-type') ?? '').startsWith('multipart/form-data')
      const captured = {
        body: isForm ? '' : await request.clone().text(),
        form: isForm ? await request.clone().formData() : undefined,
        headers: request.headers,
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

/** O erro que a chamada lançou, ou `undefined` se ela não lançou: o teste afirma sobre ele. */
const failureOf = (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => undefined,
    (error: unknown) => error,
  )

const sheet = new File([new Uint8Array(1_000)], 'FR-05-10.xlsm')

describe('as leituras da prévia (spec 237 T4.4)', () => {
  test('lista com limite 100, cursor e os filtros do servidor', async () => {
    const { calls, client } = harness(() =>
      json({ data: [buildPreviewSummary()], nextCursor: 'proxima' }),
    )

    const page = await client.listPreviews({
      cursor: 'c-1',
      filters: { contractorId: ALFA_ID, status: 'ready' },
    })

    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url.pathname).toBe('/cargo-previews')
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({
      contractorId: ALFA_ID,
      cursor: 'c-1',
      limit: '100',
      status: 'ready',
    })
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer token-sintetico')
    expect(page.nextCursor).toBe('proxima')
    expect(page.items).toHaveLength(1)
  })

  test('o detalhe leva o cursor por linha e o filtro de estado e de roteiro', async () => {
    const { calls, client } = harness(() => json({ data: buildPreviewDetail() }))

    const detail = await client.getPreview({
      filters: { afterRow: '54', routeName: 'FR.S.CAR', state: 'matched' },
      previewId: PREVIEW_ID,
    })

    expect(calls[0]?.url.pathname).toBe(`/cargo-previews/${PREVIEW_ID}`)
    expect(Object.fromEntries(calls[0]?.url.searchParams ?? [])).toEqual({
      afterRow: '54',
      limit: '100',
      routeName: 'FR.S.CAR',
      state: 'matched',
    })
    expect(detail.items.items).toHaveLength(7)
  })

  test('o detalhe sem filtro leva só o limite', async () => {
    const { calls, client } = harness(() => json({ data: buildPreviewDetail() }))

    await client.getPreview({ filters: { afterRow: null }, previewId: PREVIEW_ID })

    expect([...(calls[0]?.url.searchParams.keys() ?? [])]).toEqual(['limit'])
  })

  test('o perfil devolve só os dois interruptores; sem perfil ambos desligados', async () => {
    const { calls, client } = harness((captured) =>
      captured.url.pathname.includes(ALFA_ID)
        ? json({ data: { isEnabled: true, matchWindowDays: 15, previewEnabled: true } })
        : json({ data: null }),
    )

    expect(await client.readProfileFlags(ALFA_ID)).toEqual({
      isEnabled: true,
      previewEnabled: true,
    })
    expect(await client.readProfileFlags('outro')).toEqual({
      isEnabled: false,
      previewEnabled: false,
    })
    expect(calls[0]?.url.pathname).toBe(`/contractors/${ALFA_ID}/receiving-profile`)
  })
})

describe('o envio multipart', () => {
  test('vai como formulário com SÓ contratante e arquivo, e com a chave de idempotência', async () => {
    const { calls, client } = harness(() => json({ data: buildPreviewSummary() }, 201))

    const result = await client.uploadPreview({
      idempotencyKey: 'chave-0000000000000001',
      input: { contractorId: ALFA_ID, file: sheet },
    })

    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url.pathname).toBe('/cargo-previews')
    expect(calls[0]?.headers.get('idempotency-key')).toBe('chave-0000000000000001')
    expect([...(calls[0]?.form?.keys() ?? [])].sort()).toEqual(['contractorId', 'file'])
    expect(calls[0]?.form?.get('contractorId')).toBe(ALFA_ID)
    expect((calls[0]?.form?.get('file') as File).name).toBe('FR-05-10.xlsm')
    expect(result.isReplay).toBe(false)
  })

  test('o content-type não é fixado à mão: o navegador põe o boundary', async () => {
    const { calls, client } = harness(() => json({ data: buildPreviewSummary() }, 201))

    await client.uploadPreview({
      idempotencyKey: 'chave-0000000000000001',
      input: { contractorId: ALFA_ID, file: sheet },
    })

    expect(calls[0]?.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/u)
  })

  test('200 é a mesma planilha já enviada (repetição), 201 é a primeira vez', async () => {
    const replay = harness(() => json({ data: buildPreviewSummary() }, 200))

    const result = await replay.client.uploadPreview({
      idempotencyKey: 'chave-0000000000000001',
      input: { contractorId: ALFA_ID, file: sheet },
    })

    expect(result.isReplay).toBe(true)
    expect(result.preview.id).toBe(PREVIEW_ID)
  })

  test('413 e 422 sobem com o código que a tela traduz', async () => {
    const tooLarge = harness(() =>
      json({ error: { code: 'PREVIEW_FILE_TOO_LARGE', message: 'x' } }, 413),
    )
    const notEnabled = harness(() =>
      json({ error: { code: 'CARGO_PREVIEW_NOT_ENABLED', message: 'x' } }, 422),
    )
    const request = {
      idempotencyKey: 'chave-0000000000000001',
      input: { contractorId: ALFA_ID, file: sheet },
    }

    expect(await failureOf(tooLarge.client.uploadPreview(request))).toMatchObject({
      message: 'PREVIEW_FILE_TOO_LARGE',
    })
    expect(await failureOf(notEnabled.client.uploadPreview(request))).toMatchObject({
      message: 'CARGO_PREVIEW_NOT_ENABLED',
    })
  })

  test('o erro do servidor leva os details de TODOS os campos', async () => {
    const { client } = harness(() =>
      json(
        {
          error: {
            code: 'INVALID_REQUEST',
            details: [
              { field: 'contractorId', message: 'One contractor id is required' },
              { field: 'file', message: 'One file is required' },
            ],
            message: 'x',
          },
        },
        400,
      ),
    )

    const error = await client
      .uploadPreview({
        idempotencyKey: 'chave-0000000000000001',
        input: { contractorId: '', file: sheet },
      })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(CargoReceivingRequestError)
    expect((error as CargoReceivingRequestError).details.map((detail) => detail.field)).toEqual([
      'contractorId',
      'file',
    ])
  })
})

describe('as ações sobre o item e a proposta', () => {
  test('confirmar e desvincular vão sem corpo; vincular leva só o documentId', async () => {
    const { calls, client } = harness(() =>
      json({ data: { itemIds: [itemIdOf(3)], outcome: 'changed' } }),
    )
    const base = { itemId: itemIdOf(3), previewId: PREVIEW_ID }

    await client.itemAction({ ...base, action: 'confirm' })
    await client.itemAction({ ...base, action: 'unlink' })
    const linked = await client.itemAction({
      ...base,
      action: 'link',
      documentId: documentIdOf(52_003),
    })

    expect(calls.map((call) => call.url.pathname)).toEqual([
      `/cargo-previews/${PREVIEW_ID}/items/${itemIdOf(3)}/confirm`,
      `/cargo-previews/${PREVIEW_ID}/items/${itemIdOf(3)}/unlink`,
      `/cargo-previews/${PREVIEW_ID}/items/${itemIdOf(3)}/link`,
    ])
    expect(calls.every((call) => call.method === 'POST')).toBe(true)
    expect(calls[0]?.body).toBe('')
    expect(calls[1]?.body).toBe('')
    expect(JSON.parse(calls[2]?.body ?? '{}')).toEqual({ documentId: documentIdOf(52_003) })
    expect(linked).toEqual({ itemIds: [itemIdOf(3)], outcome: 'changed' })
  })

  test('propor a chegada é POST sem corpo e devolve o rascunho', async () => {
    const proposal = {
      contractorId: ALFA_ID,
      documentIds: [documentIdOf(52_001)],
      plannedDate: '2026-10-05',
      previewId: PREVIEW_ID,
      refused: [{ documentId: documentIdOf(52_006), reason: 'DOCUMENT_ALREADY_IN_ARRIVAL' }],
    }
    const { calls, client } = harness(() => json({ data: proposal }))

    const draft = await client.proposeArrival(PREVIEW_ID)

    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url.pathname).toBe(`/cargo-previews/${PREVIEW_ID}/propose-arrival`)
    expect(calls[0]?.body).toBe('')
    expect(draft).toEqual(proposal)
  })

  test('resposta fora do formato é recusada, nunca passada adiante', async () => {
    const { client } = harness(() => json({ data: { qualquer: 'coisa' } }))

    expect(await failureOf(client.proposeArrival(PREVIEW_ID))).toMatchObject({
      message: 'RESPONSE_INVALID',
    })
    expect(
      await failureOf(
        client.itemAction({ action: 'confirm', itemId: itemIdOf(1), previewId: PREVIEW_ID }),
      ),
    ).toMatchObject({ message: 'RESPONSE_INVALID' })
  })
})
