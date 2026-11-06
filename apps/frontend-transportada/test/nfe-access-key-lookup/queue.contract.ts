/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  CHECK_BATCH_WINDOW_MS,
  LOOKUP_POLL_INTERVAL_MS,
  LOOKUP_POLL_MAX_DURATION_MS,
} from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookup.constant'
import {
  AccessKeyLookupRequestError,
  createAccessKeyLookupClient,
} from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookupClient.service'
import { createAccessKeyLookupQueue } from '../../src/modules/nfe-access-key-lookup/shared/accessKeyLookupQueue.service'
import {
  createFakeClient,
  createFakeScheduler,
  flushPromises,
  KEY_ONE,
  KEY_TWO,
  view,
} from './lookup.fixture'

function setup() {
  const client = createFakeClient()
  const scheduler = createFakeScheduler()
  const queue = createAccessKeyLookupQueue({ client, scheduler })
  const stateOf = (key: string) => queue.getRows().find((row) => row.accessKey === key)?.state
  return { client, queue, scheduler, stateOf }
}

describe('fila de busca por chave: lote de conferência', () => {
  it('chaves lidas dentro de 500 ms vão numa chamada só', async () => {
    const { client, queue, scheduler } = setup()
    queue.add(KEY_ONE)
    await scheduler.advance(200)
    queue.add(KEY_TWO)
    expect(client.calls.checks).toHaveLength(0)

    await scheduler.advance(CHECK_BATCH_WINDOW_MS)

    expect(client.calls.checks).toEqual([[KEY_ONE, KEY_TWO]])
  })

  it('leitura depois da janela abre outro lote', async () => {
    const { client, queue, scheduler } = setup()
    queue.add(KEY_ONE)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    queue.add(KEY_TWO)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS)

    expect(client.calls.checks).toEqual([[KEY_ONE], [KEY_TWO]])
  })

  it('o lote fecha antes da janela ao chegar a 200 chaves', async () => {
    const { client, queue } = setup()
    for (let index = 0; index < 200; index += 1) {
      queue.add(`${String(index).padStart(6, '0')}${'1'.repeat(38)}`)
    }
    await flushPromises()

    expect(client.calls.checks).toHaveLength(1)
    expect(client.calls.checks[0]).toHaveLength(200)
  })

  it('chave repetida não cria linha, nem conferência, nem busca nova', async () => {
    const { client, queue, scheduler } = setup()
    expect(queue.add(KEY_ONE)).toEqual({ alreadyScanned: false })
    expect(queue.add(KEY_ONE)).toEqual({ alreadyScanned: true })
    await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    expect(queue.add(KEY_ONE)).toEqual({ alreadyScanned: true })
    await scheduler.advance(LOOKUP_POLL_INTERVAL_MS)

    expect(queue.getRows()).toHaveLength(1)
    expect(client.calls.checks).toEqual([[KEY_ONE]])
    expect(client.calls.requests).toEqual([KEY_ONE])
  })

  it('nota cadastrada vira pronta sem pedir busca; ausente pede a busca', async () => {
    const { client, queue, scheduler, stateOf } = setup()
    client.documents.set(KEY_ONE, 'doc-1')
    queue.add(KEY_ONE)
    queue.add(KEY_TWO)
    expect(stateOf(KEY_ONE)).toEqual({ kind: 'checking' })

    await scheduler.advance(CHECK_BATCH_WINDOW_MS)

    expect(stateOf(KEY_ONE)).toEqual({ documentId: 'doc-1', kind: 'ready' })
    expect(stateOf(KEY_TWO)).toEqual({ kind: 'searching', status: 'queued' })
    expect(client.calls.requests).toEqual([KEY_TWO])
  })

  it('a conferência que falha deixa a linha em erro com o código, e tentar de novo busca', async () => {
    const { client, queue, scheduler, stateOf } = setup()
    client.checkAccessKeys = () => Promise.reject(new AccessKeyLookupRequestError('RATE_LIMITED'))
    queue.add(KEY_ONE)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    expect(stateOf(KEY_ONE)).toEqual({ code: 'RATE_LIMITED', kind: 'error' })

    queue.retry(KEY_ONE)
    await flushPromises()

    expect(client.calls.requests).toEqual([KEY_ONE])
    expect(stateOf(KEY_ONE)).toEqual({ kind: 'searching', status: 'queued' })
  })
})

describe('fila de busca por chave: polling', () => {
  it('consulta a cada 3 s enquanto em fila ou consultando', async () => {
    const { client, queue, scheduler, stateOf } = setup()
    queue.add(KEY_ONE)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    expect(client.calls.gets).toHaveLength(0)

    await scheduler.advance(LOOKUP_POLL_INTERVAL_MS - 1)
    expect(client.calls.gets).toHaveLength(0)
    await scheduler.advance(1)
    expect(client.calls.gets).toHaveLength(1)
    await scheduler.advance(LOOKUP_POLL_INTERVAL_MS * 3)

    expect(client.calls.gets).toHaveLength(4)
    expect(stateOf(KEY_ONE)).toEqual({ kind: 'searching', status: 'querying' })
  })

  it('espera de janela (waiting) mostra o horário e segue consultando', async () => {
    const { client, queue, scheduler, stateOf } = setup()
    client.requestResponses.set(KEY_ONE, () =>
      Promise.resolve({
        kind: 'lookup',
        lookup: view({ notBefore: '2026-11-06T18:30:00.000Z', status: 'waiting' }),
      }),
    )
    client.getResponses.set('lookup-1', () =>
      Promise.resolve(view({ notBefore: '2026-11-06T18:30:00.000Z', status: 'waiting' })),
    )
    queue.add(KEY_ONE)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS + LOOKUP_POLL_INTERVAL_MS * 2)

    expect(stateOf(KEY_ONE)).toEqual({ kind: 'waiting', notBefore: '2026-11-06T18:30:00.000Z' })
    expect(client.calls.gets).toHaveLength(2)
  })

  it('para ao chegar em estado terminal e vira pronta com o documento', async () => {
    const { client, queue, scheduler, stateOf } = setup()
    client.getResponses.set('lookup-1', () =>
      Promise.resolve(view({ documentId: 'doc-7', status: 'imported' })),
    )
    queue.add(KEY_ONE)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS + LOOKUP_POLL_INTERVAL_MS)
    expect(stateOf(KEY_ONE)).toEqual({ documentId: 'doc-7', kind: 'ready' })

    await scheduler.advance(LOOKUP_POLL_INTERVAL_MS * 10)

    expect(client.calls.gets).toHaveLength(1)
    expect(scheduler.pendingCount()).toBe(0)
  })

  it('recusada e falha também encerram o polling', async () => {
    const { client, queue, scheduler, stateOf } = setup()
    client.requestResponses.set(KEY_ONE, () =>
      Promise.resolve({ kind: 'lookup', lookup: view({ id: 'a', status: 'queued' }) }),
    )
    client.requestResponses.set(KEY_TWO, () =>
      Promise.resolve({ kind: 'lookup', lookup: view({ id: 'b', status: 'queued' }) }),
    )
    client.getResponses.set('a', () =>
      Promise.resolve(view({ id: 'a', reason: 'summary_only', status: 'refused' })),
    )
    client.getResponses.set('b', () =>
      Promise.resolve(view({ id: 'b', reason: 'sefaz_unavailable', status: 'failed' })),
    )
    queue.add(KEY_ONE)
    queue.add(KEY_TWO)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS + LOOKUP_POLL_INTERVAL_MS * 5)

    expect(stateOf(KEY_ONE)).toEqual({ kind: 'refused', reason: 'summary_only' })
    expect(stateOf(KEY_TWO)).toEqual({ kind: 'failed', reason: 'sefaz_unavailable' })
    expect(client.calls.gets).toEqual(['a', 'b'])
  })

  it('depois de 10 minutos para de consultar e pede nova tentativa', async () => {
    const { client, queue, scheduler, stateOf } = setup()
    queue.add(KEY_ONE)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    await scheduler.advance(LOOKUP_POLL_MAX_DURATION_MS - 1)
    expect(stateOf(KEY_ONE)?.kind).toBe('searching')

    await scheduler.advance(LOOKUP_POLL_INTERVAL_MS)
    const getsAtStall = client.calls.gets.length
    expect(stateOf(KEY_ONE)).toEqual({ kind: 'stalled' })
    await scheduler.advance(LOOKUP_POLL_INTERVAL_MS * 10)

    expect(client.calls.gets).toHaveLength(getsAtStall)
    expect(scheduler.pendingCount()).toBe(0)
  })

  it('tentar de novo repete o POST e volta a consultar', async () => {
    const { client, queue, scheduler, stateOf } = setup()
    queue.add(KEY_ONE)
    await scheduler.advance(
      CHECK_BATCH_WINDOW_MS + LOOKUP_POLL_MAX_DURATION_MS + LOOKUP_POLL_INTERVAL_MS,
    )
    expect(stateOf(KEY_ONE)).toEqual({ kind: 'stalled' })
    const getsBefore = client.calls.gets.length

    queue.retry(KEY_ONE)
    await flushPromises()
    await scheduler.advance(LOOKUP_POLL_INTERVAL_MS)

    expect(client.calls.requests).toEqual([KEY_ONE, KEY_ONE])
    expect(client.calls.gets.length).toBe(getsBefore + 1)
    expect(stateOf(KEY_ONE)?.kind).toBe('searching')
  })

  it('só tenta de novo o que o estado permite', async () => {
    const { client, queue, scheduler } = setup()
    client.documents.set(KEY_ONE, 'doc-1')
    queue.add(KEY_ONE)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    queue.retry(KEY_ONE)
    await flushPromises()

    expect(client.calls.requests).toEqual([])
  })

  it('falha ao consultar a busca vira erro com o código', async () => {
    const { client, queue, scheduler, stateOf } = setup()
    client.getResponses.set('lookup-1', () => Promise.reject(new AccessKeyLookupRequestError('X')))
    queue.add(KEY_ONE)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS + LOOKUP_POLL_INTERVAL_MS)

    expect(stateOf(KEY_ONE)).toEqual({ code: 'X', kind: 'error' })
    expect(scheduler.pendingCount()).toBe(0)
  })

  it('fechar a tela (stop) cancela os relógios; reabrir (start) retoma a busca', async () => {
    const { client, queue, scheduler, stateOf } = setup()
    queue.add(KEY_ONE)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS + LOOKUP_POLL_INTERVAL_MS)
    expect(client.calls.gets).toHaveLength(1)

    queue.stop()
    expect(scheduler.pendingCount()).toBe(0)
    await scheduler.advance(LOOKUP_POLL_INTERVAL_MS * 5)
    expect(client.calls.gets).toHaveLength(1)

    queue.start()
    await scheduler.advance(LOOKUP_POLL_INTERVAL_MS)
    expect(client.calls.gets).toHaveLength(2)
    expect(stateOf(KEY_ONE)?.kind).toBe('searching')
  })
})

describe('fila de busca por chave: envio de XML', () => {
  it('recusada vira pronta quando o XML entra (markXmlImported)', async () => {
    const { client, queue, scheduler, stateOf } = setup()
    client.requestResponses.set(KEY_ONE, () =>
      Promise.resolve({
        kind: 'lookup',
        lookup: view({ reason: 'summary_only', status: 'refused' }),
      }),
    )
    queue.add(KEY_ONE)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS)
    expect(stateOf(KEY_ONE)).toEqual({ kind: 'refused', reason: 'summary_only' })

    queue.markXmlImported(KEY_ONE, 'doc-xml')

    expect(stateOf(KEY_ONE)).toEqual({ documentId: 'doc-xml', kind: 'ready' })
  })

  it('recheck só vira pronta quando a conferência acha o documento', async () => {
    const { client, queue, scheduler, stateOf } = setup()
    client.requestResponses.set(KEY_ONE, () =>
      Promise.resolve({
        kind: 'lookup',
        lookup: view({ reason: 'not_interested', status: 'refused' }),
      }),
    )
    queue.add(KEY_ONE)
    await scheduler.advance(CHECK_BATCH_WINDOW_MS)

    expect(await queue.recheck(KEY_ONE)).toBe(false)
    expect(stateOf(KEY_ONE)).toEqual({ kind: 'refused', reason: 'not_interested' })

    client.documents.set(KEY_ONE, 'doc-from-xml')
    expect(await queue.recheck(KEY_ONE)).toBe(true)
    expect(stateOf(KEY_ONE)).toEqual({ documentId: 'doc-from-xml', kind: 'ready' })
  })
})

describe('cliente HTTP da busca por chave', () => {
  function clientWith(respond: (request: Request) => Response) {
    const requests: Request[] = []
    const client = createAccessKeyLookupClient({
      apiUrl: 'https://api.test/v1',
      fetch: (input) => {
        const request = input as Request
        requests.push(request)
        return Promise.resolve(respond(request))
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    return { client, requests }
  }

  /** `rejects` sem espera passa calado quando a promessa resolve: o código é lido à mão. */
  async function errorCodeOf(call: () => Promise<unknown>): Promise<string | undefined> {
    try {
      await call()
    } catch (error) {
      return error instanceof AccessKeyLookupRequestError ? error.code : undefined
    }
    return undefined
  }

  async function readBody(request: Request | undefined): Promise<unknown> {
    return request === undefined ? undefined : ((await request.json()) as unknown)
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status })

  it('POST /nfe-access-key-lookups: 201 devolve a busca e 200 found devolve o documento', async () => {
    const created = clientWith(() => json({ data: { id: 'l1', status: 'queued' } }, 201))
    expect(await created.client.requestLookup(KEY_ONE)).toEqual({
      kind: 'lookup',
      lookup: { documentId: null, id: 'l1', notBefore: null, reason: null, status: 'queued' },
    })
    expect(created.requests[0]?.url).toBe('https://api.test/v1/nfe-access-key-lookups')
    expect(created.requests[0]?.headers.get('authorization')).toBe('Bearer token')
    expect(await readBody(created.requests[0])).toEqual({ accessKey: KEY_ONE })

    const found = clientWith(() => json({ data: { documentId: 'd1', status: 'found' } }))
    expect(await found.client.requestLookup(KEY_ONE)).toEqual({ documentId: 'd1', kind: 'found' })
  })

  it('GET /nfe-access-key-lookups/:id lê status, motivo e janela', async () => {
    const { client, requests } = clientWith(() =>
      json({
        data: {
          documentId: null,
          id: 'l1',
          notBefore: '2026-11-06T18:00:00Z',
          reason: null,
          status: 'waiting',
        },
      }),
    )
    const lookup = await client.getLookup('l1')

    expect(lookup.status).toBe('waiting')
    expect(lookup.notBefore).toBe('2026-11-06T18:00:00Z')
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.url).toBe('https://api.test/v1/nfe-access-key-lookups/l1')
  })

  it('POST /nfe-documents/access-key-checks manda as chaves e lê documentId ou nulo', async () => {
    const { client, requests } = clientWith(() =>
      json({
        data: [
          { accessKey: KEY_ONE, documentId: 'd1' },
          { accessKey: KEY_TWO, documentId: null },
        ],
      }),
    )

    expect(await client.checkAccessKeys([KEY_ONE, KEY_TWO])).toEqual([
      { accessKey: KEY_ONE, documentId: 'd1' },
      { accessKey: KEY_TWO, documentId: null },
    ])
    expect(await readBody(requests[0])).toEqual({ accessKeys: [KEY_ONE, KEY_TWO] })
  })

  it('o código do erro da API sobe como código; 429 sem corpo vira RATE_LIMITED', async () => {
    const conflict = clientWith(() =>
      json({ error: { code: 'NFE_DISTRIBUTION_NOT_CONFIGURED', message: 'x' } }, 409),
    )
    expect(await errorCodeOf(() => conflict.client.requestLookup(KEY_ONE))).toBe(
      'NFE_DISTRIBUTION_NOT_CONFIGURED',
    )
    const limited = clientWith(() => new Response('', { status: 429 }))
    expect(await errorCodeOf(() => limited.client.requestLookup(KEY_ONE))).toBe('RATE_LIMITED')
  })

  it('corpo fora da forma é erro de resposta, não linha com dado inventado', async () => {
    const { client } = clientWith(() => json({ data: { id: 'l1', status: 'inventado' } }))
    expect(await errorCodeOf(() => client.getLookup('l1'))).toBe(
      'NFE_ACCESS_KEY_LOOKUP_RESPONSE_INVALID',
    )
  })
})
