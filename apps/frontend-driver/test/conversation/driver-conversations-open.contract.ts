/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import { DRIVER_CONVERSATION_ERROR } from '../../src/modules/conversation/shared/driverConversation.constant'
import { createDriverConversationsApi } from '../../src/modules/conversation/shared/driverConversationsApi.service'
import {
  DriverConversationRequestError,
  createDriverConversationHttp,
} from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

/**
 * Spec 263 T3.3: o motorista abre a conversa de nota e de viagem — `POST .../conversations/open`,
 * sem queda para a rota antiga (ela só existe na API nova).
 */
const DOCUMENT_ID = '0b9a4b8e-0000-4000-8000-000000000201'
const TRIP_ID = '0b9a4b8e-0000-4000-8000-000000000100'
const OPEN_URL = 'https://api.test/v1/me/trips/current/conversations/open'

type Recorded = { body: string; headers: Headers; method: string; url: string }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function summaryOf(subjectType: string, subjectId: string, overrides: object = {}) {
  return {
    awaitingDriver: true,
    channels: ['app'],
    lastMessageAt: null,
    protocol: '261009-K7M2',
    status: 'open',
    subjectId,
    subjectLabel: 'NF 900101 · Mercearia do Centro',
    subjectType,
    tripId: TRIP_ID,
    unreadCount: 0,
    ...overrides,
  }
}

function createHarness(respond: (recorded: Recorded) => Response | Promise<Response>) {
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
  const api = createDriverConversationsApi({
    fallbackSubjectLabel: () => 'Ocorrência',
    http,
    isOnline: () => true,
    outbox: createConversationOutbox({
      getOwnerKey: () => 'owner-1',
      runExclusive: (run) => run(),
      store: createMemoryOutboxStore(),
    }),
  })
  return { api, requests }
}

async function captureRejection(
  promise: Promise<unknown>,
): Promise<DriverConversationRequestError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof DriverConversationRequestError) return error
    throw error
  }
  throw new Error('expected the promise to reject')
}

function openOf(api: ReturnType<typeof createHarness>['api']) {
  return (subject: { subjectId: string; subjectType: string }) => api.openConversation(subject)
}

describe('adapter do motorista: openConversation', () => {
  it('nota: POST com o corpo estrito, token buscado a cada chamada e resumo mapeado', async () => {
    const { api, requests } = createHarness(() =>
      json({ data: summaryOf('document', DOCUMENT_ID) }, 201),
    )
    const first = await openOf(api)({ subjectId: DOCUMENT_ID, subjectType: 'document' })
    await openOf(api)({ subjectId: DOCUMENT_ID, subjectType: 'document' })
    expect(requests).toHaveLength(2)
    expect(requests[0]).toMatchObject({ method: 'POST', url: OPEN_URL })
    expect(JSON.parse(requests[0]?.body ?? '')).toEqual({
      subjectId: DOCUMENT_ID,
      subjectType: 'document',
    })
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer token-1')
    expect(requests[1]?.headers.get('authorization')).toBe('Bearer token-2')
    expect(first).toMatchObject({
      awaitingParticipant: true,
      protocol: '261009-K7M2',
      status: 'open',
      subjectId: DOCUMENT_ID,
      subjectType: 'document',
      unreadCount: 0,
    })
  })

  it('viagem já existente (200) devolve o mesmo resumo, com as não lidas', async () => {
    const { api } = createHarness(() =>
      json({ data: summaryOf('trip', TRIP_ID, { unreadCount: 2 }) }, 200),
    )
    const summary = await openOf(api)({ subjectId: TRIP_ID, subjectType: 'trip' })
    expect(summary.subjectType).toBe('trip')
    expect(summary.unreadCount).toBe(2)
  })

  it('ocorrência é recusada sem tocar a rede', async () => {
    const { api, requests } = createHarness(() => json({}, 500))
    const error = await captureRejection(
      openOf(api)({ subjectId: DOCUMENT_ID, subjectType: 'occurrence' }),
    )
    expect(error.code).toBe(DRIVER_CONVERSATION_ERROR.SUBJECT_UNSUPPORTED)
    expect(requests).toHaveLength(0)
  })

  it('assunto desconhecido da API (404 com código) e conversa encerrada (409) repassam código e status', async () => {
    const notFound = createHarness(() =>
      json({ error: { code: 'CONVERSATION_NOT_FOUND', message: 'x' } }, 404),
    )
    const missing = await captureRejection(
      openOf(notFound.api)({ subjectId: DOCUMENT_ID, subjectType: 'document' }),
    )
    expect([missing.code, missing.status]).toEqual(['CONVERSATION_NOT_FOUND', 404])

    const closed = createHarness(() =>
      json({ error: { code: 'CONVERSATION_CLOSED', message: 'x' } }, 409),
    )
    const closedError = await captureRejection(
      openOf(closed.api)({ subjectId: DOCUMENT_ID, subjectType: 'document' }),
    )
    expect([closedError.code, closedError.status]).toEqual(['CONVERSATION_CLOSED', 409])
    expect(notFound.api.openAvailability.isUnavailable()).toBe(false)
  })

  it('429 repassa o status; a rota segue disponível', async () => {
    const { api } = createHarness(() => json({ error: { code: 'RATE_LIMITED' } }, 429))
    const error = await captureRejection(
      openOf(api)({ subjectId: DOCUMENT_ID, subjectType: 'document' }),
    )
    expect(error.status).toBe(429)
    expect(api.openAvailability.isUnavailable()).toBe(false)
  })

  it('falha de rede não tem status e não marca a rota como indisponível', async () => {
    const { api } = createHarness(() => {
      throw new TypeError('network')
    })
    const error = await captureRejection(
      openOf(api)({ subjectId: DOCUMENT_ID, subjectType: 'document' }),
    )
    expect(error.status).toBeUndefined()
    expect(error.code).toBe(DRIVER_CONVERSATION_ERROR.REQUEST_FAILED)
    expect(api.openAvailability.isUnavailable()).toBe(false)
  })

  it.each([404, 501])(
    'API sem a rota (%i, sem CONVERSATION_NOT_FOUND): CONVERSATIONS_UNAVAILABLE e não repete a chamada',
    async (status) => {
      const { api, requests } = createHarness(() =>
        json({ error: { code: 'NOT_FOUND', message: 'x' } }, status),
      )
      const notified: boolean[] = []
      api.openAvailability.subscribe(() => notified.push(api.openAvailability.isUnavailable()))
      const first = await captureRejection(
        openOf(api)({ subjectId: DOCUMENT_ID, subjectType: 'document' }),
      )
      expect(first.code).toBe(DRIVER_CONVERSATION_ERROR.CONVERSATIONS_UNAVAILABLE)
      expect(api.openAvailability.isUnavailable()).toBe(true)
      expect(notified).toEqual([true])
      const second = await captureRejection(
        openOf(api)({ subjectId: TRIP_ID, subjectType: 'trip' }),
      )
      expect(second.code).toBe(DRIVER_CONVERSATION_ERROR.CONVERSATIONS_UNAVAILABLE)
      expect(requests).toHaveLength(1)
    },
  )

  it('resposta fora do contrato do pacote vira RESPONSE_INVALID', async () => {
    const { api } = createHarness(() =>
      json(
        { data: summaryOf('document', DOCUMENT_ID, { status: 'weird', unreadCount: 'x' }) },
        201,
      ),
    )
    const error = await captureRejection(
      openOf(api)({ subjectId: DOCUMENT_ID, subjectType: 'document' }),
    )
    expect(error.code).toBe(DRIVER_CONVERSATION_ERROR.RESPONSE_INVALID)
  })
})
