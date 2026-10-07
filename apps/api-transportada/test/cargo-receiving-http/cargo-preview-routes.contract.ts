/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2: enviar e agir sobre a prévia é `trip.manage`, ler é `fleet.read` (o separador tem
 * as duas). O multipart é estrito — `companyId` no formulário é 400 —, todo campo inválido volta de
 * uma vez, e o arquivo grande é recusado pela rota com o código do leitor.
 */
import { describe, expect, test } from 'bun:test'

import { createCargoPreviewActionRoutes } from '../../src/cargo-receiving/presentation/cargo-preview-action.routes.js'
import { createCargoPreviewRoutes } from '../../src/cargo-receiving/presentation/cargo-preview.routes.js'
import { CARGO_PREVIEW_UPLOAD_MAX_BYTES } from '../../src/cargo-receiving/domain/cargo-preview-upload.policy.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/freight-region-http.fixture.js'

const PREVIEW_ID = '00000000-0000-4000-8000-000000000e01'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000e02'
const ITEM_ID = '00000000-0000-4000-8000-000000000e03'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000e04'
const KEY = 'preview-key-0000000001'
const SEPARATOR: CompanyContext['permissions'] = new Set(['fleet.read', 'trip.manage'])
const READER: CompanyContext['permissions'] = new Set(['fleet.read'])
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])

type Calls = Record<string, unknown[]>

function createFixture(input: {
  readonly isReplay?: boolean
  readonly permissions?: CompanyContext['permissions']
}) {
  const calls: Calls = {}
  const record = (name: string, result: unknown) => ({
    async execute(params: unknown) {
      ;(calls[name] ??= []).push(params)
      return result
    },
  })
  const routes = [
    ...createCargoPreviewRoutes({
      getPreview: record('get', { id: PREVIEW_ID }) as never,
      listPreviews: record('list', { items: [], nextCursor: null }) as never,
      uploadPreview: record('upload', {
        isReplay: input.isReplay ?? false,
        preview: { id: PREVIEW_ID },
      }) as never,
    }),
    ...createCargoPreviewActionRoutes({
      itemAction: record('action', { itemIds: [ITEM_ID], outcome: 'changed' }) as never,
      proposeArrival: record('propose', { previewId: PREVIEW_ID }) as never,
    }),
  ]
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(input.permissions ?? SEPARATOR),
      routes,
    }),
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

function uploadRequest(input: {
  readonly fields?: Readonly<Record<string, string>>
  readonly file?: File | null
  readonly key?: string | null
}): Request {
  const form = new FormData()
  for (const [name, value] of Object.entries(input.fields ?? { contractorId: CONTRACTOR_ID })) {
    form.append(name, value)
  }
  const file = input.file === undefined ? new File([ZIP_BYTES], 'FR-28-09.xlsm') : input.file
  if (file !== null) form.append('file', file)
  const headers: Record<string, string> = { origin: FRONTEND_ORIGIN }
  const key = input.key === undefined ? KEY : input.key
  if (key !== null) headers['idempotency-key'] = key
  return new Request(`${FRONTEND_ORIGIN}/cargo-previews`, { body: form, headers, method: 'POST' })
}

function post(path: string, body?: unknown): Request {
  return jsonRequest({ body, method: 'POST', path })
}

type ErrorBody = { readonly error: { readonly details?: readonly { readonly field: string }[] } }

async function fieldsOf(response: Response): Promise<string[]> {
  const payload = (await response.json()) as ErrorBody
  return (payload.error.details ?? []).map((detail) => detail.field).sort()
}

describe('enviar a prévia por HTTP (spec 237 T4.2)', () => {
  test('201 na criação, com contexto, chave, bytes e o nome sem caminho', async () => {
    const fixture = createFixture({})
    const file = new File([ZIP_BYTES], 'C:\\Users\\op\\FR-28-09.xlsm', { type: 'text/plain' })
    const response = await fixture.handle(uploadRequest({ file }))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ data: { id: PREVIEW_ID } })
    expect(fixture.calls.upload).toEqual([
      {
        context: { ...COMPANY_CONTEXT, permissions: SEPARATOR },
        correlationId: CORRELATION_ID,
        idempotencyKey: KEY,
        input: { bytes: ZIP_BYTES, contractorId: CONTRACTOR_ID, fileName: 'FR-28-09.xlsm' },
      },
    ])
  })

  test('o mesmo arquivo de novo responde 200, não 201', async () => {
    const response = await createFixture({ isReplay: true }).handle(uploadRequest({}))
    expect(response.status).toBe(200)
  })

  test('sem chave, sem contratante e sem arquivo, os três campos voltam juntos', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(uploadRequest({ fields: {}, file: null, key: null }))

    expect(response.status).toBe(400)
    expect(await fieldsOf(response)).toEqual(['Idempotency-Key', 'contractorId', 'file'])
    expect(fixture.calls.upload).toBeUndefined()
  })

  test.each([
    ['em minúsculas', `email:${'a'.repeat(32)}`],
    ['em maiúsculas', `EMAIL:${'a'.repeat(32)}`],
  ])(
    'a chave com o prefixo reservado da prévia por e-mail, %s, é 400 com o motivo',
    async (_label, key) => {
      const fixture = createFixture({})
      const response = await fixture.handle(uploadRequest({ key }))

      expect(response.status).toBe(400)
      const payload = (await response.json()) as {
        error: { details: { field: string; message: string }[] }
      }
      expect(payload.error.details).toEqual([
        { field: 'Idempotency-Key', message: 'The "email:" prefix is reserved' },
      ])
      expect(fixture.calls.upload).toBeUndefined()
    },
  )

  test('o prefixo reservado só vale no começo da chave', async () => {
    const fixture = createFixture({})
    const key = `chave-do-email:${'a'.repeat(32)}`
    expect((await fixture.handle(uploadRequest({ key }))).status).toBe(201)
    expect(fixture.calls.upload).toMatchObject([{ idempotencyKey: key }])
  })

  test.each([
    ['companyId no formulário', { companyId: CONTRACTOR_ID, contractorId: CONTRACTOR_ID }],
    ['contratante que não é uuid', { contractorId: 'abc' }],
    ['campo desconhecido', { contractorId: CONTRACTOR_ID, sheetName: 'X' }],
  ])('%s é 400', async (_label, fields) => {
    const fixture = createFixture({})
    expect((await fixture.handle(uploadRequest({ fields }))).status).toBe(400)
    expect(fixture.calls.upload).toBeUndefined()
  })

  test('arquivo maior que o teto é 413 PREVIEW_FILE_TOO_LARGE, sem chamar o caso de uso', async () => {
    const fixture = createFixture({})
    const big = new File([new Uint8Array(CARGO_PREVIEW_UPLOAD_MAX_BYTES + 1)], 'grande.xlsm')
    const response = await fixture.handle(uploadRequest({ file: big }))

    expect(response.status).toBe(413)
    expect((await responseApiError(response)).code).toBe('PREVIEW_FILE_TOO_LARGE')
    expect(fixture.calls.upload).toBeUndefined()
  })

  test('dois arquivos no mesmo envio são 400', async () => {
    const fixture = createFixture({})
    const form = new FormData()
    form.append('contractorId', CONTRACTOR_ID)
    form.append('file', new File([ZIP_BYTES], 'a.xlsm'))
    form.append('file', new File([ZIP_BYTES], 'b.xlsm'))
    const request = new Request(`${FRONTEND_ORIGIN}/cargo-previews`, {
      body: form,
      headers: { 'idempotency-key': KEY, origin: FRONTEND_ORIGIN },
      method: 'POST',
    })
    expect((await fixture.handle(request)).status).toBe(400)
    expect(fixture.calls.upload).toBeUndefined()
  })
})

describe('ler a prévia por HTTP (spec 237 T4.2)', () => {
  test('a lista filtra por contratante e situação, e recusa filtro desconhecido', async () => {
    const fixture = createFixture({ permissions: READER })
    const path = `/cargo-previews?contractorId=${CONTRACTOR_ID}&status=ready&limit=10`
    expect((await fixture.handle(jsonRequest({ method: 'GET', path }))).status).toBe(200)
    expect(fixture.calls.list).toEqual([
      expect.objectContaining({
        filters: { contractorId: CONTRACTOR_ID, status: 'ready' },
        paging: { cursor: null, limit: 10 },
      }),
    ])
    for (const bad of ['/cargo-previews?status=done', '/cargo-previews?companyId=x']) {
      expect((await fixture.handle(jsonRequest({ method: 'GET', path: bad }))).status).toBe(400)
    }
  })

  test('o detalhe pagina os itens por linha, com filtro por estado e roteiro', async () => {
    const fixture = createFixture({ permissions: READER })
    const path = `/cargo-previews/${PREVIEW_ID}?state=awaiting_xml&routeName=FR.S.CAR&afterRow=12&limit=50`
    expect((await fixture.handle(jsonRequest({ method: 'GET', path }))).status).toBe(200)
    expect(fixture.calls.get).toEqual([
      expect.objectContaining({
        items: { afterRow: 12, limit: 50, routeName: 'FR.S.CAR', state: 'awaiting_xml' },
        previewId: PREVIEW_ID,
      }),
    ])
    for (const query of ['state=x', 'afterRow=-1', 'limit=101', 'routeName=']) {
      const bad = `/cargo-previews/${PREVIEW_ID}?${query}`
      expect((await fixture.handle(jsonRequest({ method: 'GET', path: bad }))).status).toBe(400)
    }
  })
})

describe('as ações do operador por HTTP (spec 237 T4.2)', () => {
  const base = `/cargo-previews/${PREVIEW_ID}/items/${ITEM_ID}`

  test('confirmar, desvincular e vincular chamam o mesmo caso de uso com a ação da rota', async () => {
    const fixture = createFixture({})
    expect((await fixture.handle(post(`${base}/confirm`))).status).toBe(200)
    expect((await fixture.handle(post(`${base}/unlink`))).status).toBe(200)
    expect((await fixture.handle(post(`${base}/link`, { documentId: DOCUMENT_ID }))).status).toBe(
      200,
    )
    expect(fixture.calls.action).toEqual([
      expect.objectContaining({ action: 'confirm', itemId: ITEM_ID, previewId: PREVIEW_ID }),
      expect.objectContaining({ action: 'unlink', itemId: ITEM_ID, previewId: PREVIEW_ID }),
      expect.objectContaining({ action: 'link', documentId: DOCUMENT_ID, itemId: ITEM_ID }),
    ])
  })

  test('vincular exige a nota, e o corpo é estrito', async () => {
    const fixture = createFixture({})
    for (const body of [
      {},
      { documentId: 'x' },
      { companyId: CONTRACTOR_ID, documentId: DOCUMENT_ID },
    ]) {
      expect((await fixture.handle(post(`${base}/link`, body))).status).toBe(400)
    }
    expect((await fixture.handle(post(`${base}/confirm`, { force: true }))).status).toBe(400)
    expect(fixture.calls.action).toBeUndefined()
  })

  test('propor a chegada devolve o rascunho', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(post(`/cargo-previews/${PREVIEW_ID}/propose-arrival`))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { previewId: PREVIEW_ID } })
  })

  test('quem só lê a frota lê a prévia, mas não envia nem decide nada', async () => {
    const fixture = createFixture({ permissions: READER })
    const writes = [
      uploadRequest({}),
      post(`${base}/confirm`),
      post(`${base}/unlink`),
      post(`${base}/link`, { documentId: DOCUMENT_ID }),
      post(`/cargo-previews/${PREVIEW_ID}/propose-arrival`),
    ]
    for (const request of writes) {
      const response = await fixture.handle(request)
      expect(response.status).toBe(403)
      expect((await responseApiError(response)).code).toBe('FORBIDDEN')
    }
    expect(fixture.calls).toEqual({})
  })
})
