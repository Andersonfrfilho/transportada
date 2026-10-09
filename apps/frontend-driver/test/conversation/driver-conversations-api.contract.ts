import { describe, expect, it } from 'bun:test'

import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import { createDriverConversationsApi } from '../../src/modules/conversation/shared/driverConversationsApi.service'
import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { isAwaitingParticipant } from '../../src/modules/conversation/shared/driverConversationsMapper.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

const OCCURRENCE_ID = '0b9a4b8e-0000-4000-8000-000000000001'
const SUBJECT = { subjectId: OCCURRENCE_ID, subjectType: 'occurrence' } as const
const MESSAGES_URL = `https://api.test/v1/me/trips/current/occurrences/${OCCURRENCE_ID}/messages`

type Recorded = { body: string; headers: Headers; method: string; url: string }
type Responder = (recorded: Recorded) => Response

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the promise to reject')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function createHarness(respond: Responder) {
  const requests: Recorded[] = []
  let tokenCalls = 0
  const http = createDriverConversationHttp({
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
    getAccessToken: () => Promise.resolve(`token-${++tokenCalls}`),
  })
  let clock = new Date('2026-10-09T12:00:00.000Z')
  const api = createDriverConversationsApi({
    fallbackSubjectLabel: () => 'Ocorrência',
    http,
    isOnline: () => true,
    now: () => clock,
    outbox: createConversationOutbox({
      getOwnerKey: () => 'owner-1',
      runExclusive: (run) => run(),
      store: createMemoryOutboxStore(),
    }),
  })
  return {
    advance: (milliseconds: number) => {
      clock = new Date(clock.getTime() + milliseconds)
    },
    api,
    requests,
  }
}

const apiMessage = (overrides: Record<string, unknown> = {}) => ({
  attachments: [],
  authorName: 'Maria',
  bodyText: 'Pode seguir',
  createdAt: '2026-10-09T10:00:00.000Z',
  direction: 'outbound',
  id: 'message-1',
  status: null,
  ...overrides,
})

describe('driverConversationsApi (spec 260 T1b.2)', () => {
  it('lista as conversas como assunto "occurrence", com o token buscado a cada chamada', async () => {
    const harness = createHarness(() =>
      json({
        data: [
          {
            lastMessageAt: '2026-10-09T10:00:00.000Z',
            occurrenceId: OCCURRENCE_ID,
            occurrenceLabel: 'NF 4521 · avaria',
            unreadCount: 2,
          },
        ],
      }),
    )

    const page = await harness.api.listConversations()
    await harness.api.listConversations()

    expect(page.data).toEqual([
      {
        awaitingParticipant: true,
        lastMessageAt: '2026-10-09T10:00:00.000Z',
        status: 'open',
        subjectId: OCCURRENCE_ID,
        subjectLabel: 'NF 4521 · avaria',
        subjectType: 'occurrence',
        unreadCount: 2,
      },
    ])
    expect(harness.requests[0]?.url).toBe(
      'https://api.test/v1/me/trips/current/occurrence-conversations',
    )
    expect(harness.requests.map((request) => request.headers.get('authorization'))).toEqual([
      'Bearer token-1',
      'Bearer token-2',
    ])
  })

  it('rótulo vazio cai no texto do locale', async () => {
    const harness = createHarness(() =>
      json({
        data: [
          {
            lastMessageAt: '2026-10-09T10:00:00.000Z',
            occurrenceId: 'x',
            occurrenceLabel: '  ',
            unreadCount: 0,
          },
        ],
      }),
    )
    const page = await harness.api.listConversations()
    expect(page.data[0]?.subjectLabel).toBe('Ocorrência')
    expect(page.data[0]?.awaitingParticipant).toBe(false)
  })

  it('resposta fora do contrato é recusada, não repassada à tela', async () => {
    const harness = createHarness(() => json({ data: [{ occurrenceId: 'x' }] }))
    expect(await captureRejection(harness.api.listConversations())).toBeInstanceOf(Error)
  })

  it('mensagens: mapeia a forma da API para a do pacote e codifica o segmento', async () => {
    const harness = createHarness(() =>
      json({
        data: [
          apiMessage({
            attachments: [
              {
                contentType: 'image/jpeg',
                fileName: 'foto.jpg',
                id: 'att-1',
                sizeBytes: 10,
                url: 'https://s3/foto',
              },
            ],
          }),
        ],
      }),
    )

    const messages = await harness.api.fetchMessages(SUBJECT)

    expect(messages[0]).toMatchObject({
      attachments: [
        { filename: 'foto.jpg', id: 'att-1', kind: 'image', mimeType: 'image/jpeg', sizeBytes: 10 },
      ],
      direction: 'outbound',
      id: 'message-1',
      text: 'Pode seguir',
    })
    expect(harness.requests[0]?.url).toBe(MESSAGES_URL)
    const unsupported = harness.api.fetchMessages({ subjectId: 'a/b', subjectType: 'invoice' })
    expect(await captureRejection(unsupported)).toBeInstanceOf(Error)
  })

  it('mensagem com direção inválida é recusada', async () => {
    const harness = createHarness(() => json({ data: [apiMessage({ direction: 'sideways' })] }))
    expect(await captureRejection(harness.api.fetchMessages(SUBJECT))).toBeInstanceOf(Error)
  })

  it('envia com a clientMessageId como Idempotency-Key e a devolve na mensagem', async () => {
    const harness = createHarness(() =>
      json({ data: { conversationId: 'c', messageId: 'server-1' } }, 201),
    )

    const result = await harness.api.sendMessage({
      clientMessageId: 'client-1',
      subject: SUBJECT,
      text: 'Cheguei',
    })

    expect(result).toMatchObject({
      message: {
        clientMessageId: 'client-1',
        direction: 'inbound',
        id: 'server-1',
        text: 'Cheguei',
      },
      outcome: 'sent',
    })
    const sent = harness.requests[0]
    expect(sent?.method).toBe('POST')
    expect(sent?.headers.get('idempotency-key')).toBe('client-1')
    expect(JSON.parse(sent?.body ?? '{}')).toEqual({ body: 'Cheguei' })
  })

  it('a mensagem buscada depois leva a clientMessageId, para a bolha local não duplicar', async () => {
    const harness = createHarness((recorded) =>
      recorded.method === 'POST'
        ? json({ data: { conversationId: 'c', messageId: 'server-1' } }, 201)
        : json({
            data: [
              apiMessage({ direction: 'inbound', id: 'server-1' }),
              apiMessage({ id: 'server-2' }),
            ],
          }),
    )

    await harness.api.sendMessage({ clientMessageId: 'client-1', subject: SUBJECT, text: 'Oi' })
    const messages = await harness.api.fetchMessages(SUBJECT)

    expect(messages.map((message) => message.clientMessageId)).toEqual(['client-1', undefined])
  })

  it('anexo sobe em duas etapas, sem o token no PUT, e o reenvio reaproveita o id', async () => {
    const harness = createHarness((recorded) => {
      if (recorded.url.endsWith('/uploads')) {
        return json({ data: { uploadId: 'upload-1', uploadUrl: 'https://storage.test/put' } }, 201)
      }
      if (recorded.method === 'PUT') return new Response(null, { status: 200 })
      return json({ data: { conversationId: 'c', messageId: 'server-1' } }, 201)
    })
    const file = new File(['abc'], 'canhoto.png', { type: 'image/png' })

    await harness.api.sendMessage({ clientMessageId: 'client-1', files: [file], subject: SUBJECT })
    await harness.api.sendMessage({ clientMessageId: 'client-1', files: [file], subject: SUBJECT })

    const calls = harness.requests.map((request) => `${request.method} ${request.url}`)
    expect(calls).toEqual([
      `POST https://api.test/v1/me/trips/current/occurrences/${OCCURRENCE_ID}/uploads`,
      'PUT https://storage.test/put',
      `POST ${MESSAGES_URL}`,
      `POST ${MESSAGES_URL}`,
    ])
    expect(harness.requests[1]?.headers.get('authorization')).toBeNull()
    expect(JSON.parse(harness.requests[2]?.body ?? '{}')).toEqual({
      attachmentIds: ['upload-1'],
      body: '',
    })
  })

  it('marca como lida só aquele assunto', async () => {
    const harness = createHarness(() => new Response(null, { status: 204 }))
    await harness.api.markRead(SUBJECT)
    expect(harness.requests[0]?.url).toBe(`${MESSAGES_URL}/read`)
  })

  it('a URL do anexo vem da leitura das mensagens e é renovada antes de vencer', async () => {
    let version = 0
    const harness = createHarness(() =>
      json({
        data: [
          apiMessage({
            attachments: [
              {
                contentType: 'application/pdf',
                fileName: 'a.pdf',
                id: 'att-1',
                sizeBytes: 5,
                url: `https://s3/a?v=${++version}`,
              },
            ],
          }),
        ],
      }),
    )
    const [message] = await harness.api.fetchMessages(SUBJECT)
    const attachment = message?.attachments[0]
    if (attachment === undefined) throw new Error('attachment missing')

    expect(await harness.api.resolveAttachmentUrl(attachment)).toBe('https://s3/a?v=1')
    harness.advance(5 * 60 * 1000)
    expect(await harness.api.resolveAttachmentUrl(attachment)).toBe('https://s3/a?v=2')
    const unknown = harness.api.resolveAttachmentUrl({ ...attachment, id: 'desconhecido' })
    expect(await captureRejection(unknown)).toBeInstanceOf(Error)
  })

  it('espera a resposta do motorista quando a última mensagem aberta é da operação', async () => {
    const harness = createHarness((recorded) =>
      recorded.url.endsWith('/messages')
        ? json({
            data: [
              apiMessage({ direction: 'inbound', id: 'm1' }),
              apiMessage({ createdAt: '2026-10-09T11:00:00.000Z', id: 'm2' }),
            ],
          })
        : json({
            data: [
              {
                lastMessageAt: '2026-10-09T11:00:00.000Z',
                occurrenceId: OCCURRENCE_ID,
                occurrenceLabel: 'NF 1',
                unreadCount: 0,
              },
            ],
          }),
    )

    await harness.api.fetchMessages(SUBJECT)
    const page = await harness.api.listConversations()

    expect(page.data[0]?.awaitingParticipant).toBe(true)
  })

  it('isAwaitingParticipant: só a última da operação, depois da última do motorista', () => {
    const base = { attachments: [], id: 'x' }
    const outbound = {
      ...base,
      createdAt: '2026-10-09T11:00:00.000Z',
      direction: 'outbound' as const,
    }
    const inbound = {
      ...base,
      createdAt: '2026-10-09T12:00:00.000Z',
      direction: 'inbound' as const,
    }
    expect(isAwaitingParticipant([])).toBe(false)
    expect(isAwaitingParticipant([inbound, outbound])).toBe(false)
    expect(
      isAwaitingParticipant([outbound, { ...inbound, createdAt: '2026-10-09T10:00:00.000Z' }]),
    ).toBe(true)
  })

  it('código de erro da API chega pelo code, não pelo texto', async () => {
    const harness = createHarness(() => json({ error: { code: 'TRIP_OCCURRENCE_NOT_FOUND' } }, 404))
    expect(await captureRejection(harness.api.fetchMessages(SUBJECT))).toMatchObject({
      code: 'TRIP_OCCURRENCE_NOT_FOUND',
    })
  })
})
