/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantSubjectRef } from '@adatechnology/conversation-contracts'
import type { ParticipantConversationEvent } from '@adatechnology/conversations-ui/participant'
import { describe, expect, it } from 'bun:test'

import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import { createDriverConversationsApi } from '../../src/modules/conversation/shared/driverConversationsApi.service'
import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

const SUBJECT: ParticipantSubjectRef = { subjectId: 'occurrence-1', subjectType: 'occurrence' }

type ServerMode = 'ok' | 'network-down' | 'unauthorized' | 'unavailable' | 'rejected'

/** Servidor falso que reproduz a regra da API: mesma chave devolve o que foi gravado, sem duplicar. */
function createHarness(initialMode: ServerMode = 'ok') {
  let mode = initialMode
  let isOnline = true
  const postsByKey = new Map<string, number>()
  const savedByKey = new Map<string, string>()
  const bodiesByKey = new Map<string, unknown[]>()
  let uploadRequests = 0
  const events: ParticipantConversationEvent[] = []
  const http = createDriverConversationHttp({
    baseUrl: 'https://api.test/v1',
    fetch: async (request) => {
      if (mode === 'network-down') throw new TypeError('Failed to fetch')
      const path = new URL(request.url).pathname
      if (request.method === 'PUT') return new Response(null, { status: 200 })
      if (path.endsWith('/uploads')) {
        uploadRequests += 1
        return json({
          data: { uploadId: `upload-${uploadRequests}`, uploadUrl: 'https://s3.test/x' },
        })
      }
      return answerMessage(request)
    },
    getAccessToken: () => Promise.resolve('token'),
  })

  async function answerMessage(request: Request): Promise<Response> {
    if (mode === 'unauthorized') return json({ error: { code: 'UNAUTHENTICATED' } }, 401)
    if (mode === 'unavailable') return json({ error: { code: 'UNAVAILABLE' } }, 503)
    if (mode === 'rejected') return json({ error: { code: 'VALIDATION' } }, 422)
    const key = request.headers.get('idempotency-key') ?? ''
    postsByKey.set(key, (postsByKey.get(key) ?? 0) + 1)
    bodiesByKey.set(key, [...(bodiesByKey.get(key) ?? []), JSON.parse(await request.text())])
    if (!savedByKey.has(key)) savedByKey.set(key, `server-${savedByKey.size + 1}`)
    return json({ data: { id: savedByKey.get(key) } }, 201)
  }

  const outbox = createConversationOutbox({
    getOwnerKey: () => 'owner-1',
    random: () => 0.5,
    runExclusive: (run) => run(),
    store: createMemoryOutboxStore(),
  })
  const api = createDriverConversationsApi({
    fallbackSubjectLabel: () => 'Ocorrência',
    http,
    isOnline: () => isOnline,
    outbox,
    refreshEnvironment: { isVisible: () => false },
  })
  api.subscribe?.((event) => events.push(event))
  return {
    api,
    bodiesByKey,
    events,
    postsByKey,
    savedCount: () => savedByKey.size,
    setMode: (next: ServerMode) => {
      mode = next
    },
    setOnline: (next: boolean) => {
      isOnline = next
    },
    uploads: () => uploadRequests,
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

const send = (id: string, extra: { files?: File[]; text?: string } = {}) => ({
  clientMessageId: id,
  subject: SUBJECT,
  text: 'Entreguei, sem canhoto',
  ...extra,
})

describe('driverConversationsApi offline (spec 260 T1b.3)', () => {
  it('sem rede devolve queued, grava a mensagem e não chama a API', async () => {
    const harness = createHarness()
    harness.setOnline(false)

    const result = await harness.api.sendMessage(send('m1'))

    expect(result).toEqual({ outcome: 'queued' })
    expect(harness.postsByKey.size).toBe(0)
    const pending = await harness.api.outbox.listPending()
    expect(pending.map((item) => [item.clientMessageId, item.state, item.text])).toEqual([
      ['m1', 'queued', 'Entreguei, sem canhoto'],
    ])
  })

  it.each<ServerMode>(['network-down', 'unauthorized', 'unavailable'])(
    'falha transitória (%s) no envio fica na fila em vez de falhar',
    async (mode) => {
      const harness = createHarness(mode)

      expect(await harness.api.sendMessage(send('m1'))).toEqual({ outcome: 'queued' })
      expect((await harness.api.outbox.listPending())[0]?.state).toBe('queued')
    },
  )

  it('recusa permanente (4xx) lança e não entra na fila', async () => {
    const harness = createHarness('rejected')

    const rejection = await harness.api.sendMessage(send('m1')).catch((error: unknown) => error)
    expect(rejection).toMatchObject({ status: 422 })
    expect(await harness.api.outbox.listPending()).toEqual([])
  })

  it('a mesma chave duas vezes vira uma mensagem só no servidor', async () => {
    const harness = createHarness('network-down')
    await harness.api.sendMessage(send('m1'))
    harness.setMode('ok')

    await harness.api.flushOutbox('immediate')
    const reply = await harness.api.sendMessage(send('m1'))

    expect(reply.outcome).toBe('sent')
    expect(harness.postsByKey.get('m1')).toBe(2)
    expect(harness.savedCount()).toBe(1)
    expect(await harness.api.outbox.listPending()).toEqual([])
  })

  it('o flush envia com a Idempotency-Key e avisa a conversa e a lista', async () => {
    const harness = createHarness()
    harness.setOnline(false)
    await harness.api.sendMessage(send('m1'))
    harness.setOnline(true)

    await harness.api.flushOutbox('immediate')

    expect(harness.postsByKey.get('m1')).toBe(1)
    expect(harness.bodiesByKey.get('m1')).toEqual([{ body: 'Entreguei, sem canhoto' }])
    expect(harness.events).toEqual([
      { subject: SUBJECT, type: 'conversation-changed' },
      { type: 'inbox-changed' },
    ])
  })

  it('anexo sobe uma vez só e os ids são reaproveitados no reenvio', async () => {
    const harness = createHarness('network-down')
    harness.setOnline(false)
    const file = new File(['abc'], 'canhoto.jpg', { type: 'image/jpeg' })
    await harness.api.sendMessage(send('m1', { files: [file] }))
    harness.setOnline(true)
    harness.setMode('unavailable')
    await harness.api.flushOutbox('immediate')
    harness.setMode('ok')

    await harness.api.flushOutbox('immediate')
    await harness.api.flushOutbox('immediate')

    expect(harness.uploads()).toBe(1)
    expect(harness.bodiesByKey.get('m1')).toEqual([
      { attachmentIds: ['upload-1'], body: 'Entreguei, sem canhoto' },
    ])
    expect(harness.savedCount()).toBe(1)
  })

  it('recusa no flush vira failed e o reenvio manual entrega', async () => {
    const harness = createHarness('network-down')
    await harness.api.sendMessage(send('m1'))
    harness.setMode('rejected')
    await harness.api.flushOutbox('immediate')
    expect((await harness.api.outbox.listPending())[0]?.state).toBe('failed')

    harness.setMode('ok')
    await harness.api.retryPending('m1')

    expect(harness.postsByKey.get('m1')).toBe(1)
    expect(await harness.api.outbox.listPending()).toEqual([])
  })
})
