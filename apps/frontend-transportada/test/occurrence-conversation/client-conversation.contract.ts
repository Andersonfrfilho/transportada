/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 283 (T4): a conversa do cliente na ocorrência. Só existe quando houve envio; terceira coluna em tela larga,
 * faixa recolhida em tela média, aba no modo abas e no celular; E-mail é canal dentro da conversa, não uma conversa.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  clientChannelKey,
  clientChannelTone,
  findClientConversation,
  resolveClientPlacement,
  resolveColumnsGrid,
} from '@/modules/occurrence-conversation/shared/clientConversation.service'
import { createOccurrenceConversationClient } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'
import { OCCURRENCE_CLIENT_CHANNEL_STATUSES } from '@/modules/occurrence-conversation/shared/occurrenceConversation.types'
import {
  OCCURRENCE_DETAIL_PHONE_TABS,
  occurrenceDetailPhoneTabsFor,
  occurrenceDetailSectionsFor,
} from '@/modules/trip/shared/tripOccurrenceDetail.service'

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8')
}

describe('onde a conversa do cliente aparece (D3, D7)', () => {
  test('sem envio ao cliente a tela fica como está, em qualquer largura e modo', () => {
    for (const layout of ['side-by-side', 'tabs'] as const) {
      for (const isWide of [true, false]) {
        expect(resolveClientPlacement({ hasClientConversation: false, isWide, layout })).toBe(
          'none',
        )
      }
    }
  })

  test('coluna em tela larga, faixa em tela média, aba no modo abas', () => {
    expect(
      resolveClientPlacement({ hasClientConversation: true, isWide: true, layout: 'side-by-side' }),
    ).toBe('column')
    expect(
      resolveClientPlacement({
        hasClientConversation: true,
        isWide: false,
        layout: 'side-by-side',
      }),
    ).toBe('strip')
    expect(
      resolveClientPlacement({ hasClientConversation: true, isWide: true, layout: 'tabs' }),
    ).toBe('tab')
  })

  test('no celular a aba Cliente só entra quando existe a conversa, e mostra só ela', () => {
    expect(occurrenceDetailPhoneTabsFor(false)).toEqual([...OCCURRENCE_DETAIL_PHONE_TABS])
    expect(occurrenceDetailPhoneTabsFor(true)).toEqual([...OCCURRENCE_DETAIL_PHONE_TABS, 'client'])
    expect(occurrenceDetailSectionsFor('client')).toEqual(['clientConversation'])
  })
})

describe('a grade de colunas de duas para três (RF6)', () => {
  const none = { client: false, contractor: false, driver: false }

  test('sem minimizar, divide igual; a contagem acompanha as colunas à vista', () => {
    expect(resolveColumnsGrid(['contractor', 'driver'], none)).toEqual({
      collapsedIndex: null,
      count: 2,
    })
    expect(resolveColumnsGrid(['contractor', 'driver', 'client'], none)).toEqual({
      collapsedIndex: null,
      count: 3,
    })
  })

  test('uma coluna minimizada vira a 1ª, 2ª ou 3ª conforme a posição, não conforme o nome', () => {
    expect(
      resolveColumnsGrid(['contractor', 'driver', 'client'], { ...none, client: true }),
    ).toEqual({ collapsedIndex: 3, count: 3 })
    expect(resolveColumnsGrid(['contractor', 'client'], { ...none, client: true })).toEqual({
      collapsedIndex: 2,
      count: 2,
    })
    expect(
      resolveColumnsGrid(['contractor', 'driver', 'client'], { ...none, contractor: true }),
    ).toEqual({ collapsedIndex: 1, count: 3 })
  })

  test('mais de uma minimizada, ou uma sozinha, divide igual: nenhuma conversa some', () => {
    expect(
      resolveColumnsGrid(['contractor', 'driver', 'client'], {
        client: true,
        contractor: true,
        driver: false,
      }).collapsedIndex,
    ).toBeNull()
    expect(
      resolveColumnsGrid(['contractor'], { ...none, contractor: true }).collapsedIndex,
    ).toBeNull()
  })

  test('o CSS tem as três larguras de coluna e a terceira trilha só em tela larga', async () => {
    const css = await source('modules/occurrence-conversation/styles/occurrenceThread.module.css')
    for (const name of [
      'columnsThree',
      'columnsFirstCollapsed',
      'columnsSecondCollapsed',
      'columnsThirdCollapsed',
    ]) {
      expect(css).toContain(`.${name} {`)
    }
    const component = await source(
      'modules/occurrence-conversation/components/OccurrenceConversations.component.tsx',
    )
    expect(component).toContain("useMinWidth('80rem')")
  })
})

describe('os canais abertos (D4)', () => {
  test('todo estado tem um tom, e a falha é o único tom ruim', () => {
    for (const status of OCCURRENCE_CLIENT_CHANNEL_STATUSES) {
      expect(['ok', 'wait', 'bad']).toContain(clientChannelTone(status))
    }
    expect(
      OCCURRENCE_CLIENT_CHANNEL_STATUSES.filter((s) => clientChannelTone(s) === 'bad'),
    ).toEqual(['failed'])
  })

  test('o mesmo número não vira dois chips, e e-mail com número igual não colide', () => {
    expect(
      clientChannelKey({ kind: 'whatsapp', maskedAddress: 'a', replyTarget: null, status: 'sent' }),
    ).not.toBe(
      clientChannelKey({ kind: 'email', maskedAddress: 'a', replyTarget: null, status: 'sent' }),
    )
  })

  test('os textos pt/en existem para cada estado, e o chip junta ícone + palavra + destino', async () => {
    const pt = JSON.parse(
      await source('modules/occurrence-conversation/locales/occurrenceConversation.locale.json'),
    ) as { client: { status: Record<string, string> } }
    const en = JSON.parse(
      await source('modules/occurrence-conversation/locales/occurrenceConversation.en.locale.json'),
    ) as { client: { status: Record<string, string> } }
    for (const status of OCCURRENCE_CLIENT_CHANNEL_STATUSES) {
      expect(pt.client.status[status]).toBeTruthy()
      expect(en.client.status[status]).toBeTruthy()
    }
    const chip = await source(
      'modules/occurrence-conversation/components/ClientChannelsStrip.component.tsx',
    )
    expect(chip).toContain('<Icon name={CHANNEL_ICONS[channel.kind]}')
    expect(chip).toContain('channel.maskedAddress')
    expect(chip).toContain('client.status.')
  })
})

describe('a resposta da API com a conversa do cliente', () => {
  function clientView(extra: Record<string, unknown>) {
    return {
      conversations: [
        { id: 'c1', messages: [], participant: 'contractor', status: 'open', unreadCount: 0 },
        {
          id: 'c2',
          messages: [],
          participant: 'client',
          status: 'open',
          unreadCount: 2,
          ...extra,
        },
      ],
      contractorPortal: { available: false },
    }
  }

  async function read(view: unknown) {
    const client = createOccurrenceConversationClient({
      apiUrl: 'https://api.example.test',
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ data: view }), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
        ),
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })
    return client.listConversations({ occurrenceId: 'o1' })
  }

  test('lê o participante cliente no formato do contrato T1; canal inválido some, a conversa fica', async () => {
    const view = await read(
      clientView({
        client: {
          channels: [
            {
              addressMasked: '+55 ••••1234',
              channel: 'whatsapp',
              replyTarget: { confirmed: false, id: 'rt-1' },
              state: 'replied',
            },
            { addressMasked: 'fi•••@mercado.com.br', channel: 'email', state: 'failed' },
            { addressMasked: '1', channel: 'sms', state: 'sent' },
            { addressMasked: 'a', channel: 'email', state: 'inventado' },
          ],
          name: 'Supermercado Bom Preço',
          taxIdMasked: '12.•••.•••/0001-90',
        },
        messages: [
          {
            attachments: [],
            author: { kind: 'automatic' },
            bodyText: '',
            channel: 'whatsapp',
            clientDelivery: {
              actorKind: 'office',
              actorName: 'Ana',
              deliveryId: 'd1',
              documentName: 'boleto-nf-1234.pdf',
              recipientMasked: '+55 ••••1234',
            },
            createdAt: '2026-10-27T10:00:00.000Z',
            direction: 'outbound',
            id: 'm1',
            status: 'read',
            statusTimes: {},
          },
          {
            attachments: [],
            author: { addressMasked: '+55 ••••1234', kind: 'client' },
            bodyText: 'Recebi, obrigado',
            channel: 'whatsapp',
            createdAt: '2026-10-27T10:10:00.000Z',
            direction: 'inbound',
            id: 'm2',
            status: null,
            statusTimes: {},
          },
          {
            attachments: [],
            author: { kind: 'operation', name: 'Ana', userId: 'u1' },
            bodyText: 'Bom dia, o boleto segue acima.',
            channel: 'whatsapp',
            clientDelivery: null,
            createdAt: '2026-10-27T10:20:00.000Z',
            direction: 'outbound',
            id: 'm3',
            recipientMasked: '+55 ••••1234',
            status: 'sent',
            statusTimes: {},
          },
        ],
      }),
    )
    const client = findClientConversation(view.conversations)
    expect(client?.unreadCount).toBe(2)
    expect(client?.client).toEqual({
      channels: [
        {
          kind: 'whatsapp',
          maskedAddress: '+55 ••••1234',
          replyTarget: { confirmed: false, id: 'rt-1' },
          status: 'replied',
        },
        {
          kind: 'email',
          maskedAddress: 'fi•••@mercado.com.br',
          replyTarget: null,
          status: 'failed',
        },
      ],
      name: 'Supermercado Bom Preço',
    })
    expect(client?.messages[0]?.clientDelivery?.documentName).toBe('boleto-nf-1234.pdf')
    expect(client?.messages[1]?.author).toEqual({ addressMasked: '+55 ••••1234', kind: 'client' })
    /** A resposta do painel vem sem `clientDelivery` e com o destino mascarado na própria mensagem. */
    expect(client?.messages[2]?.clientDelivery).toBeUndefined()
    expect(client?.messages[2]?.recipientMasked).toBe('+55 ••••1234')
  })

  test('sem `client` na resposta, a conversa do cliente vem com lista vazia', async () => {
    const view = await read(clientView({}))
    expect(findClientConversation(view.conversations)?.client?.channels).toEqual([])
  })
})
