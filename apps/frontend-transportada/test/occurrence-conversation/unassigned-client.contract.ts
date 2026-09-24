/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T505 (RF9): o cliente da fila de mensagens sem conversa. A leitura é tolerante — item que
 * o guard não reconhece sai da fila, e a candidata malformada sai da escolha —; atribuir manda só a
 * conversa escolhida.
 */
import { describe, expect, test } from 'bun:test'

import { createOccurrenceConversationClient } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'

const API_URL = 'https://api.example.test'

function createClient(response: Response, requests: Request[] = []) {
  return createOccurrenceConversationClient({
    apiUrl: API_URL,
    fetch: (request) => {
      requests.push(request)
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

const ITEM = {
  bodyText: 'Qual das duas?',
  candidates: [
    {
      contractorName: 'Contratante Alfa',
      conversationId: 'conversation-a',
      lastOutbound: { at: '2026-09-24T14:00:00.000Z', preview: 'Autorizam a descarga?' },
      occurrenceId: 'occurrence-a',
      occurrenceKind: 'document',
    },
    { conversationId: 'broken' },
  ],
  channel: 'whatsapp',
  contact: { contactId: 'contact-1', name: 'Maria Souza' },
  id: 'unassigned-1',
  receivedAt: '2026-09-24T15:00:00.000Z',
  senderAddress: '5511987654321',
}

describe('cliente da fila sem conversa (spec 183 T505)', () => {
  test('lista a fila; item e candidata malformados saem, sem derrubar a tela', async () => {
    const requests: Request[] = []
    const client = createClient(Response.json({ data: [ITEM, { id: 'broken-item' }] }), requests)

    const items = await client.listUnassigned()

    expect(items).toHaveLength(1)
    expect(items[0]?.candidates.map((candidate) => candidate.conversationId)).toEqual([
      'conversation-a',
    ])
    expect(requests[0]?.url).toBe(`${API_URL}/occurrence-conversations/unassigned`)
  })

  test('atribuir manda só a conversa escolhida', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json({ data: { conversationId: 'conversation-a', messageId: 'message-1' } }),
      requests,
    )

    await client.assignUnassigned({
      conversationId: 'conversation-a',
      unassignedId: 'unassigned-1',
    })

    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe(
      `${API_URL}/occurrence-conversations/unassigned/unassigned-1/assign`,
    )
    expect(await requests[0]?.json()).toEqual({ conversationId: 'conversation-a' })
  })
})
