/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import { createDriverConversationsApi } from '../../src/modules/conversation/shared/driverConversationsApi.service'
import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

const OCCURRENCE = { subjectId: 'occ-1', subjectType: 'occurrence' } as const
const DOCUMENT = { subjectId: 'doc-1', subjectType: 'document' } as const
const BASE = 'https://api.test/v1/me/trips/current'

type Recorded = { body: string; headers: Headers; method: string; url: string }

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status })

const routeMissing = (status = 404): Response =>
  json({ error: { code: 'ROUTE_NOT_FOUND' } }, status)

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the promise to reject')
}

function createHarness(respond: (recorded: Recorded) => Response, isOnline = true) {
  const requests: Recorded[] = []
  let online = isOnline
  const api = createDriverConversationsApi({
    fallbackSubjectLabel: () => 'Ocorrência',
    http: createDriverConversationHttp({
      baseUrl: 'https://api.test/v1',
      fetch: async (request) => {
        const recorded = {
          body: await request.text(),
          headers: request.headers,
          method: request.method,
          url: request.url,
        }
        requests.push(recorded)
        return respond(recorded)
      },
      getAccessToken: () => Promise.resolve('token'),
    }),
    isOnline: () => online,
    outbox: createConversationOutbox({
      getOwnerKey: () => 'owner-1',
      random: () => 0.5,
      runExclusive: (run) => run(),
      store: createMemoryOutboxStore(),
    }),
    refreshEnvironment: { isVisible: () => false },
  })
  return {
    api,
    requests,
    setOnline: (next: boolean) => {
      online = next
    },
    urls: () => requests.map((request) => `${request.method} ${request.url}`),
  }
}

const legacyList = () =>
  json({
    data: [
      {
        lastMessageAt: '2026-10-09T10:00:00.000Z',
        occurrenceId: 'occ-1',
        occurrenceLabel: 'Avaria',
        unreadCount: 1,
      },
    ],
  })

describe('rotas por assunto com queda para as de ocorrência (spec 260 T1b.11)', () => {
  it.each([404, 501])('lista: status %i da rota nova cai na antiga e fica nela', async (status) => {
    const harness = createHarness((recorded) =>
      recorded.url === `${BASE}/occurrence-conversations` ? legacyList() : routeMissing(status),
    )

    const first = await harness.api.listConversations()
    await harness.api.listConversations()

    expect(first.data).toEqual([
      {
        awaitingParticipant: true,
        lastMessageAt: '2026-10-09T10:00:00.000Z',
        status: 'open',
        subjectId: 'occ-1',
        subjectLabel: 'Avaria',
        subjectType: 'occurrence',
        unreadCount: 1,
      },
    ])
    expect(harness.urls()).toEqual([
      `GET ${BASE}/conversations`,
      `GET ${BASE}/occurrence-conversations`,
      `GET ${BASE}/occurrence-conversations`,
    ])
  })

  it('erro que não é rota ausente (500, 404 CONVERSATION_NOT_FOUND) não dispara a queda', async () => {
    const serverError = createHarness(() => json({ error: { code: 'BOOM' } }, 500))
    expect(await captureRejection(serverError.api.listConversations())).toMatchObject({
      status: 500,
    })
    expect(serverError.requests).toHaveLength(1)

    const notFound = createHarness(() => json({ error: { code: 'CONVERSATION_NOT_FOUND' } }, 404))
    expect(await captureRejection(notFound.api.fetchMessages(OCCURRENCE))).toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
    })
    expect(notFound.requests).toHaveLength(1)
  })

  it('mensagens e envio da ocorrência caem na rota antiga, com a mesma Idempotency-Key', async () => {
    const harness = createHarness((recorded) => {
      if (recorded.url.includes('/conversations/')) return routeMissing()
      return recorded.method === 'POST'
        ? json({ data: { conversationId: 'c', messageId: 'server-1' } }, 201)
        : json({ data: [] })
    })

    await harness.api.fetchMessages(OCCURRENCE)
    const result = await harness.api.sendMessage({
      clientMessageId: 'client-1',
      subject: OCCURRENCE,
      text: 'Oi',
    })

    expect(result).toMatchObject({ message: { id: 'server-1' }, outcome: 'sent' })
    expect(harness.urls()).toEqual([
      `GET ${BASE}/conversations/occurrence/occ-1/messages`,
      `GET ${BASE}/occurrences/occ-1/messages`,
      `POST ${BASE}/occurrences/occ-1/messages`,
    ])
    expect(harness.requests[2]?.headers.get('idempotency-key')).toBe('client-1')
  })

  it('na queda, nota e viagem são recusadas sem tentar a rede de novo', async () => {
    const harness = createHarness(() => routeMissing())
    const first = harness.api.fetchMessages(DOCUMENT)
    expect(await captureRejection(first)).toMatchObject({
      code: 'DRIVER_CONVERSATION_SUBJECT_UNSUPPORTED',
    })
    expect(harness.requests).toHaveLength(1)
  })
})

describe('fila offline com a rota por assunto (spec 260 T1b.11)', () => {
  it('a mensagem da nota espera a rede e sai pela rota do assunto, com a mesma chave', async () => {
    const harness = createHarness(() => json({ data: { id: 'server-1' } }, 201), false)

    const queued = await harness.api.sendMessage({
      clientMessageId: 'client-9',
      subject: DOCUMENT,
      text: 'Cheguei',
    })
    expect(queued).toEqual({ outcome: 'queued' })
    expect(harness.requests).toHaveLength(0)

    harness.setOnline(true)
    await harness.api.flushOutbox('immediate')

    expect(harness.urls()).toEqual([`POST ${BASE}/conversations/document/doc-1/messages`])
    expect(harness.requests[0]?.headers.get('idempotency-key')).toBe('client-9')
    expect(JSON.parse(harness.requests[0]?.body ?? '{}')).toEqual({ body: 'Cheguei' })
  })

  it('assunto desconhecido é recusado antes de ir à fila ou à rede', async () => {
    const harness = createHarness(() => json({}))
    const send = harness.api.sendMessage({
      clientMessageId: 'client-1',
      subject: { subjectId: 'x', subjectType: 'invoice' },
      text: 'Oi',
    })
    expect(await captureRejection(send)).toBeInstanceOf(Error)
    expect(harness.requests).toHaveLength(0)
  })
})

describe('mapeamento do resumo (spec 260 T1b.10)', () => {
  it('canal desconhecido é descartado e o protocolo, o ícone e o preview passam', async () => {
    const harness = createHarness(() =>
      json({
        data: [
          {
            awaitingDriver: false,
            channels: ['app', 'pigeon', 'whatsapp', 'app'],
            iconName: 'truck',
            lastMessageAt: null,
            lastMessagePreview: 'Oi',
            protocol: '261009-K7M2',
            status: 'open',
            subjectId: 'trip-1',
            subjectLabel: 'Viagem de 09/10',
            subjectType: 'trip',
            unreadCount: 0,
          },
        ],
        pagination: { nextCursor: null },
      }),
    )
    const page = await harness.api.listConversations()
    expect(page.data[0]).toMatchObject({
      channels: ['app', 'whatsapp'],
      iconName: 'truck',
      lastMessagePreview: 'Oi',
      protocol: '261009-K7M2',
      subjectType: 'trip',
    })
  })
})
