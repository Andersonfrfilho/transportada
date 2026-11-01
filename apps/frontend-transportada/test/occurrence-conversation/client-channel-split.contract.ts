/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 287 (etapa 4): a conversa do cliente separada por canal. Só há separação quando o cliente tem mais de um
 * canal; cada canal lê as próprias mensagens (o e-mail junta a conversa `client_email` e os e-mails antigos que
 * moravam na conversa do WhatsApp) e envia só por ele.
 */
import { describe, expect, test } from 'bun:test'

import {
  findClientEmailConversation,
  resolveClientChannelTabs,
  selectClientChannelMessages,
} from '@/modules/occurrence-conversation/shared/clientChannelSplit.service'
import { createOccurrenceConversationClient } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'
import type {
  OccurrenceConversation,
  OccurrenceConversationMessage,
} from '@/modules/occurrence-conversation/shared/occurrenceConversation.types'

function message(
  id: string,
  channel: 'email' | 'whatsapp',
  createdAt: string,
): OccurrenceConversationMessage {
  return {
    attachments: [],
    author: { kind: 'automatic' },
    bodyText: id,
    channel,
    createdAt,
    direction: 'outbound',
    id,
    status: 'sent',
    statusTimes: {},
  }
}

function conversation(
  participant: OccurrenceConversation['participant'],
  messages: readonly OccurrenceConversationMessage[],
  channels: readonly ('email' | 'whatsapp')[] = [],
): OccurrenceConversation {
  return {
    ...(participant === 'client'
      ? {
          client: {
            channels: channels.map((kind) => ({
              kind,
              maskedAddress: 'x',
              replyTarget: null,
              status: 'sent' as const,
            })),
            name: null,
          },
        }
      : {}),
    id: `${participant}-1`,
    messages,
    participant,
    status: 'open',
    unreadCount: 0,
  }
}

describe('a separação do cliente por canal (spec 287)', () => {
  test('acha a conversa de e-mail do cliente entre as conversas', () => {
    const email = conversation('client_email', [])
    expect(
      findClientEmailConversation([
        conversation('contractor', []),
        email,
        conversation('driver', []),
      ]),
    ).toBe(email)
    expect(findClientEmailConversation([conversation('client', [])])).toBeUndefined()
    expect(findClientEmailConversation(undefined)).toBeUndefined()
  })

  test('só separa por canal quando há mais de um; com um só, o chat fica como estava', () => {
    const whatsappOnly = conversation('client', [], ['whatsapp'])
    expect(resolveClientChannelTabs({ client: whatsappOnly, email: undefined })).toEqual([])

    const both = conversation('client', [], ['whatsapp', 'email'])
    expect(resolveClientChannelTabs({ client: both, email: undefined })).toEqual([
      'whatsapp',
      'email',
    ])

    expect(
      resolveClientChannelTabs({
        client: conversation('client', [], ['whatsapp']),
        email: conversation('client_email', []),
      }),
    ).toEqual(['whatsapp', 'email'])

    expect(
      resolveClientChannelTabs({ client: conversation('client', [], ['email']), email: undefined }),
    ).toEqual([])
  })

  test('cada canal lê só as suas mensagens, em ordem; o e-mail junta a conversa nova e os e-mails antigos', () => {
    const client = conversation('client', [
      message('wa-1', 'whatsapp', '2026-11-01T10:00:00.000Z'),
      message('old-mail', 'email', '2026-11-01T09:00:00.000Z'),
    ])
    const email = conversation('client_email', [
      message('mail-1', 'email', '2026-11-01T11:00:00.000Z'),
    ])

    expect(
      selectClientChannelMessages({ channel: 'whatsapp', client, email }).map((m) => m.id),
    ).toEqual(['wa-1'])
    expect(
      selectClientChannelMessages({ channel: 'email', client, email }).map((m) => m.id),
    ).toEqual(['old-mail', 'mail-1'])
    expect(
      selectClientChannelMessages({ channel: 'email', client, email: undefined }).map((m) => m.id),
    ).toEqual(['old-mail'])
  })

  test('envia por e-mail pela rota do cliente, só com o texto, e lê a conversa de e-mail', async () => {
    const calls: { body: unknown; key: null | string; url: string }[] = []
    const client = createOccurrenceConversationClient({
      apiUrl: 'https://api.example.test',
      fetch: async (input) => {
        const request = input
        calls.push({
          body: await request.json(),
          key: request.headers.get('idempotency-key'),
          url: request.url,
        })
        return new Response(JSON.stringify({ data: { conversationMessageId: 'm-9' } }), {
          headers: { 'content-type': 'application/json' },
          status: 202,
        })
      },
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })

    const receipt = await client.sendClientEmail({
      body: 'Segue o boleto.',
      idempotencyKey: 'client-email:1',
      occurrenceId: 'o1',
    })

    expect(receipt).toEqual({ conversationMessageId: 'm-9' })
    expect(calls).toEqual([
      {
        body: { body: 'Segue o boleto.', channel: 'email' },
        key: 'client-email:1',
        url: calls[0]?.url ?? '',
      },
    ])
    expect(calls[0]?.url).toContain('/client/messages')
  })

  test('lê o participante client_email sem derrubar a lista', async () => {
    const client = createOccurrenceConversationClient({
      apiUrl: 'https://api.example.test',
      fetch: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: {
                contractorPortal: { available: false },
                conversations: [
                  {
                    id: 'c1',
                    messages: [],
                    participant: 'client_email',
                    status: 'open',
                    unreadCount: 0,
                  },
                ],
              },
            }),
            { headers: { 'content-type': 'application/json' }, status: 200 },
          ),
        ),
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })

    const view = await client.listConversations({ occurrenceId: 'o1' })

    expect(view.conversations.map((item) => item.participant)).toEqual(['client_email'])
  })
})
