/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T604 (RF11, RF14): o cliente do app do motorista para a conversa da ocorrência. Baixar a
 * lista e a conversa é o que marca "entregue" no servidor; abrir chama a leitura; responder leva a
 * chave. Item malformado sai da lista, sem derrubar a tela.
 */
import { describe, expect, test } from 'bun:test'

import {
  countDriverUnread,
  createDriverConversationClient,
} from '@/modules/occurrence-conversation/shared/driverConversationClient.service'

const API_URL = 'https://api.example.test'
const OCCURRENCE_ID = 'occurrence-1'

function createClient(response: Response, requests: Request[] = []) {
  return createDriverConversationClient({
    apiUrl: API_URL,
    /** Uma resposta nova por chamada: o corpo de um `Response` só pode ser lido uma vez. */
    fetch: (request) => {
      requests.push(request)
      return Promise.resolve(response.clone())
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

describe('cliente da conversa no app do motorista (spec 183 T604)', () => {
  test('lista as conversas dele; item malformado sai', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json({
        data: [
          {
            lastMessageAt: '2026-09-24T17:05:00.000Z',
            occurrenceId: OCCURRENCE_ID,
            occurrenceLabel: 'NF 4512/1',
            unreadCount: 2,
          },
          { occurrenceId: 'broken' },
        ],
      }),
      requests,
    )

    const conversations = await client.listConversations()

    expect(conversations).toEqual([
      {
        lastMessageAt: '2026-09-24T17:05:00.000Z',
        occurrenceId: OCCURRENCE_ID,
        occurrenceLabel: 'NF 4512/1',
        unreadCount: 2,
      },
    ])
    expect(countDriverUnread(conversations)).toBe(2)
    expect(requests[0]?.url).toBe(`${API_URL}/me/trips/current/occurrence-conversations`)
  })

  test('lê as mensagens da ocorrência e marca lida ao abrir', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json({
        data: [
          {
            authorName: 'Operadora Lima',
            bodyText: 'Pode aguardar?',
            createdAt: '2026-09-24T17:00:00.000Z',
            direction: 'outbound',
            id: 'message-1',
            status: 'delivered',
          },
        ],
      }),
      requests,
    )

    const messages = await client.listMessages(OCCURRENCE_ID)
    await client.markRead(OCCURRENCE_ID)

    expect(messages.map((message) => message.id)).toEqual(['message-1'])
    expect(requests.map((request) => [request.method, request.url])).toEqual([
      ['GET', `${API_URL}/me/trips/current/occurrences/${OCCURRENCE_ID}/messages`],
      ['POST', `${API_URL}/me/trips/current/occurrences/${OCCURRENCE_ID}/messages/read`],
    ])
  })

  test('responde com a chave e só o texto', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json({ data: { conversationId: 'c-1', messageId: 'm-2' } }, { status: 201 }),
      requests,
    )

    await client.reply({
      body: 'Aguardo sim.',
      idempotencyKey: 'driver-reply:key-0001',
      occurrenceId: OCCURRENCE_ID,
    })

    expect(requests[0]?.headers.get('idempotency-key')).toBe('driver-reply:key-0001')
    expect(await requests[0]?.json()).toEqual({ body: 'Aguardo sim.' })
  })
})
