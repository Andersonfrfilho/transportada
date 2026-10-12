/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantSubjectRef } from '@adatechnology/conversation-contracts'
import { describe, expect, it } from 'bun:test'

import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import type {
  ConversationOutboxStore,
  OutboxEvent,
} from '../../src/modules/conversation/shared/conversationOutbox.types'
import { discardConversationOutbox } from '../../src/modules/conversation/shared/conversationOutboxDiscard.service'
import {
  CONVERSATION_OUTBOX_LIMIT,
  DRIVER_CONVERSATION_ERROR,
} from '../../src/modules/conversation/shared/driverConversation.constant'
import { createDriverConversationsApi } from '../../src/modules/conversation/shared/driverConversationsApi.service'
import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

const SUBJECT: ParticipantSubjectRef = { subjectId: 'occ-1', subjectType: 'occurrence' }
const MEBIBYTE = 1024 * 1024
const BASE = 'https://api.test/v1/me/trips/current'

/** Um áudio com o tamanho declarado, sem alocar os bytes: o teto olha `size`, nunca o conteúdo. */
function audioFile(sizeBytes: number, name = 'audio-20261012-101500.m4a'): File {
  const file = new File(['a'], name, { type: 'audio/mp4' })
  Object.defineProperty(file, 'size', { value: sizeBytes })
  return file
}

const audioMessage = (clientMessageId: string, sizeBytes = MEBIBYTE) => ({
  clientMessageId,
  files: [audioFile(sizeBytes)],
  subject: SUBJECT,
  text: '',
})

const textMessage = (clientMessageId: string) => ({
  clientMessageId,
  files: [],
  subject: SUBJECT,
  text: `texto ${clientMessageId}`,
})

function createHarness(store: ConversationOutboxStore = createMemoryOutboxStore()) {
  const events: OutboxEvent[] = []
  const outbox = createConversationOutbox({
    getOwnerKey: () => 'owner-1',
    random: () => 0.5,
    runExclusive: (run) => run(),
    store,
  })
  outbox.subscribe((event) => events.push(event))
  return { events, outbox, store }
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the promise to reject')
}

const FULL = { code: DRIVER_CONVERSATION_ERROR.OUTBOX_FULL }

describe('fila offline com áudio: tetos e cota (spec 264 T4.2, contract §5.4)', () => {
  it('declara 100 itens e 48 MiB de arquivo', () => {
    expect(CONVERSATION_OUTBOX_LIMIT).toEqual({ maxCount: 100, maxFileBytes: 48 * MEBIBYTE })
  })

  it('aceita o áudio gravado como anexo da mensagem enfileirada', async () => {
    const { outbox } = createHarness()

    await outbox.enqueue(audioMessage('audio-1', 3 * MEBIBYTE))

    const [pending] = await outbox.listPending()
    expect(pending).toMatchObject({
      attachments: [{ filename: 'audio-20261012-101500.m4a', mimeType: 'audio/mp4' }],
      clientMessageId: 'audio-1',
      state: 'queued',
    })
  })

  it('o teto de bytes é a soma dos arquivos da fila mais os novos: 48 MiB exatos entram, 1 byte a mais não', async () => {
    const { outbox, store } = createHarness()
    for (const id of ['a', 'b', 'c']) await outbox.enqueue(audioMessage(id, 16 * MEBIBYTE))

    expect(await rejectionOf(outbox.enqueue(audioMessage('d', 1)))).toMatchObject(FULL)

    expect((await store.readAll()).map((item) => item.clientMessageId)).toEqual(['a', 'b', 'c'])
  })

  it('um arquivo maior que o teto sozinho é recusado antes de gravar', async () => {
    const { outbox, store } = createHarness()

    expect(await rejectionOf(outbox.enqueue(audioMessage('big', 48 * MEBIBYTE + 1)))).toMatchObject(
      FULL,
    )

    expect(await store.readAll()).toEqual([])
  })

  it('o texto entra mesmo com a cota de arquivo estourada: o "cheguei" nunca é recusado por bytes', async () => {
    const store = createMemoryOutboxStore()
    await store.put({
      attempts: 0,
      clientMessageId: 'audio-grande',
      createdAt: '2026-10-12T10:00:00.000Z',
      files: [{ blob: new Blob(['a']), name: 'a.m4a', size: 49 * MEBIBYTE, type: 'audio/mp4' }],
      ownerKey: 'owner-1',
      state: 'queued',
      subject: SUBJECT,
      text: '',
    })
    const { outbox } = createHarness(store)

    await outbox.enqueue(textMessage('cheguei'))

    expect((await outbox.listPending()).map((item) => item.clientMessageId)).toContain('cheguei')
  })

  it('o texto também entra até o teto de itens, e o item 101 é recusado', async () => {
    const { outbox, store } = createHarness()
    for (let index = 0; index < CONVERSATION_OUTBOX_LIMIT.maxCount; index += 1) {
      await outbox.enqueue(textMessage(`t${index}`))
    }

    expect(await rejectionOf(outbox.enqueue(textMessage('t-extra')))).toMatchObject(FULL)
    expect(await rejectionOf(outbox.enqueue(audioMessage('a-extra')))).toMatchObject(FULL)

    expect(await store.readAll()).toHaveLength(CONVERSATION_OUTBOX_LIMIT.maxCount)
  })

  it('a cota é do aparelho: o que ficou de outra conta também conta', async () => {
    const store = createMemoryOutboxStore()
    await store.put({
      attempts: 0,
      clientMessageId: 'other-owner',
      createdAt: '2026-10-12T10:00:00.000Z',
      files: [{ blob: new Blob(['a']), name: 'a.m4a', size: 48 * MEBIBYTE, type: 'audio/mp4' }],
      ownerKey: 'owner-2',
      state: 'queued',
      subject: SUBJECT,
      text: '',
    })
    const { outbox } = createHarness(store)

    expect(await rejectionOf(outbox.enqueue(audioMessage('mine', 1)))).toMatchObject(FULL)
  })

  it('a recusa avisa quem escuta e não grava nem emite pending-changed', async () => {
    const { events, outbox } = createHarness()
    for (const id of ['a', 'b', 'c']) await outbox.enqueue(audioMessage(id, 16 * MEBIBYTE))
    events.length = 0

    await rejectionOf(outbox.enqueue(audioMessage('d', 1)))

    expect(events).toEqual([{ type: 'enqueue-refused' }])
  })

  it('QuotaExceededError do armazenamento vira a recusa tipada, nunca o erro cru', async () => {
    const quota = new DOMException('quota', 'QuotaExceededError')
    const failing: ConversationOutboxStore = {
      ...createMemoryOutboxStore(),
      put: () => Promise.reject(quota),
    }
    const { events, outbox } = createHarness(failing)

    const error = await rejectionOf(outbox.enqueue(audioMessage('q')))

    expect(error).toMatchObject(FULL)
    expect(error).not.toBe(quota)
    expect(events).toEqual([{ type: 'enqueue-refused' }])
  })

  it('outro erro do armazenamento segue como veio', async () => {
    const broken = new Error('disk gone')
    const failing: ConversationOutboxStore = {
      ...createMemoryOutboxStore(),
      put: () => Promise.reject(broken),
    }
    const { events, outbox } = createHarness(failing)

    expect(await rejectionOf(outbox.enqueue(audioMessage('q')))).toBe(broken)
    expect(events).toEqual([])
  })

  it('o "Sair" descarta o áudio enfileirado como qualquer outra mensagem', async () => {
    const { outbox, store } = createHarness()
    await outbox.enqueue(audioMessage('audio-1'))
    await outbox.enqueue(textMessage('texto-1'))

    await discardConversationOutbox({ ownerKey: 'owner-1', store })

    expect(await store.readAll()).toEqual([])
  })
})

type Recorded = { headers: Headers; method: string; url: string }

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status })

function createApiHarness(respond: (recorded: Recorded) => Response) {
  const requests: Recorded[] = []
  let isOnline = false
  const store = createMemoryOutboxStore()
  const api = createDriverConversationsApi({
    fallbackSubjectLabel: () => 'Ocorrência',
    http: createDriverConversationHttp({
      baseUrl: 'https://api.test/v1',
      fetch: (request) => {
        const recorded = { headers: request.headers, method: request.method, url: request.url }
        requests.push(recorded)
        return Promise.resolve(respond(recorded))
      },
      getAccessToken: () => Promise.resolve('token'),
    }),
    isOnline: () => isOnline,
    outbox: createConversationOutbox({
      getOwnerKey: () => 'owner-1',
      random: () => 0.5,
      runExclusive: (run) => run(),
      store,
    }),
    refreshEnvironment: { isVisible: () => false },
  })
  return {
    api,
    requests,
    setOnline: (next: boolean) => {
      isOnline = next
    },
    store,
  }
}

describe('envio do áudio pelo adapter: recusa em memória e a mesma Idempotency-Key (spec 264 T4.2)', () => {
  it('a recusada não vai ao armazenamento e o reenvio manual, com a mesma chave, entra quando há espaço', async () => {
    const harness = createApiHarness(() => json({ data: { id: 'server-1' } }, 201))
    for (let index = 0; index < CONVERSATION_OUTBOX_LIMIT.maxCount; index += 1) {
      await harness.api.outbox.enqueue(textMessage(`t${index}`))
    }
    const audio = { clientMessageId: 'audio-1', files: [audioFile(MEBIBYTE)], subject: SUBJECT }

    expect(await rejectionOf(harness.api.sendMessage(audio))).toMatchObject(FULL)
    expect((await harness.store.readAll()).map((item) => item.clientMessageId)).not.toContain(
      'audio-1',
    )

    await harness.api.outbox.remove('t0')
    expect(await harness.api.sendMessage(audio)).toEqual({ outcome: 'queued' })
    expect(
      (await harness.store.readAll()).filter((item) => item.clientMessageId === 'audio-1'),
    ).toHaveLength(1)
  })

  it('na troca de rota e na retomada a chave é a mesma e o servidor salva uma mensagem só', async () => {
    const savedKeys = new Set<string>()
    const postKeys: string[] = []
    let uploads = 0
    const harness = createApiHarness((recorded) => {
      if (recorded.method === 'PUT') return new Response(null, { status: 200 })
      if (recorded.url.includes('/conversations/')) {
        return json({ error: { code: 'ROUTE_NOT_FOUND' } }, 404)
      }
      if (recorded.url.endsWith('/uploads')) {
        uploads += 1
        return json({ data: { uploadId: 'upload-1', uploadUrl: 'https://s3.test/audio' } })
      }
      const key = recorded.headers.get('idempotency-key') ?? ''
      postKeys.push(key)
      if (postKeys.length === 1) return json({ error: { code: 'UNAVAILABLE' } }, 503)
      savedKeys.add(key)
      return json({ data: { conversationId: 'c', messageId: 'server-1' } }, 201)
    })
    await harness.api.sendMessage({
      clientMessageId: 'audio-1',
      files: [audioFile(MEBIBYTE)],
      subject: SUBJECT,
    })
    harness.setOnline(true)

    await harness.api.flushOutbox('immediate')
    await harness.api.flushOutbox('immediate')
    await harness.api.flushOutbox('immediate')

    expect(postKeys).toEqual(['audio-1', 'audio-1'])
    expect([...savedKeys]).toEqual(['audio-1'])
    expect(uploads).toBe(1)
    expect(harness.requests.some((request) => request.url.startsWith(`${BASE}/occurrences/`))).toBe(
      true,
    )
    expect(await harness.api.outbox.listPending()).toEqual([])
  })
})
