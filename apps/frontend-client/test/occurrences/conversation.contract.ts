/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T653 (RF21, D9, ADR-0073): a conversa na tela "Ocorrências" do portal. A app não tem
 * Playwright: o que se prova é serviço puro (cliente, leitura da resposta, rascunho, agrupamento,
 * lado e tom) e texto de fonte (peças do pacote sem o `styles.css`, conversa longe da decisão, sem
 * câmera nem microfone).
 */
import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  conversationToggleLabel,
  createConversationIdempotencyKey,
  describePortalMessage,
  groupConversationByDay,
  validateConversationDraft,
} from '../../src/modules/occurrences/shared/occurrenceConversation.service'
import { createPortalClient } from '../../src/modules/shared/portalClient.service'
import type { PortalConversationMessage } from '../../src/modules/shared/portal.types'
import { toConversation, toOccurrences } from '../../src/modules/shared/portalResponse.validation'

const REF = 'Qm9hcmQtcmVmZXJlbmNpYS0xMjM0NTY'

function message(overrides: Partial<PortalConversationMessage> = {}): PortalConversationMessage {
  return {
    body: 'O recebedor recusou a caixa 3.',
    channel: 'email',
    createdAt: '2026-09-24T13:00:00.000Z',
    mine: false,
    side: 'carrier',
    ...overrides,
  }
}

describe('a resposta da conversa no portal (spec 183 T653)', () => {
  test('a ocorrência traz a referência e as não lidas; referência fora do formato vira null', () => {
    const base = {
      attachments: [],
      caseStatus: 'awaiting_contractor',
      decidedAt: null,
      decisionKind: null,
      occurrenceId: 'occurrence-1',
      occurrenceTypeName: 'Avaria',
      openedAt: '2026-09-24T10:00:00.000Z',
      stage: 'delivery',
    }

    const [withRef, withoutRef, invalid] = toOccurrences({
      data: [
        { ...base, conversationRef: REF, conversationUnreadCount: 2 },
        { ...base, conversationRef: null },
        { ...base, conversationRef: '../occurrences/1' },
      ],
    })

    expect(withRef?.conversationRef).toBe(REF)
    expect(withRef?.conversationUnreadCount).toBe(2)
    expect(withoutRef?.conversationRef).toBeNull()
    expect(withoutRef?.conversationUnreadCount).toBe(0)
    expect(invalid?.conversationRef).toBeNull()
  })

  test('a conversa lida guarda só lado, própria, canal, texto e hora; o resto não passa', () => {
    const conversation = toConversation({
      data: {
        messages: [
          {
            authorUserId: 'operator-1',
            body: 'O recebedor recusou a caixa 3.',
            channel: 'email',
            createdAt: '2026-09-24T13:00:00.000Z',
            driverName: 'não devia estar aqui',
            id: 'message-1',
            mine: false,
            side: 'carrier',
          },
          { body: 'lado inválido', channel: 'email', createdAt: 'x', mine: false, side: 'driver' },
          { body: 'canal inválido', channel: 'app', createdAt: 'x', mine: false, side: 'carrier' },
        ],
        unreadCount: 2,
      },
    })

    expect(conversation).toEqual({ messages: [message()], unreadCount: 2 })
  })

  test('resposta sem a forma certa vira conversa vazia, nunca erro na tela', () => {
    expect(toConversation({ data: null })).toEqual({ messages: [], unreadCount: 0 })
  })
})

describe('o cliente da conversa no portal (spec 183 T653)', () => {
  function clientWith(responses: readonly Response[]) {
    const calls: { readonly init: RequestInit | undefined; readonly url: string }[] = []
    let index = 0
    const client = createPortalClient({
      apiUrl: 'https://api.test',
      fetch: (input, init) => {
        calls.push({ init, url: input instanceof Request ? input.url : input.toString() })
        const response = responses[index] ?? new Response(null, { status: 500 })
        index += 1
        return Promise.resolve(response)
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    return { calls, client }
  }

  test('lê, envia com a chave no cabeçalho e marca como lida pela referência', async () => {
    const { calls, client } = clientWith([
      Response.json({ data: { messages: [message()], unreadCount: 1 } }),
      Response.json({ data: { createdAt: '2026-09-24T13:05:00.000Z' } }, { status: 201 }),
      new Response(null, { status: 204 }),
    ])

    expect(await client.readConversation(REF)).toEqual({ messages: [message()], unreadCount: 1 })
    await client.sendConversationMessage({
      body: 'Mandei a nota.',
      idempotencyKey: 'portal-message:abc-123-def-456',
      ref: REF,
    })
    await client.markConversationRead(REF)

    expect(calls.map((call) => `${call.init?.method} ${call.url}`)).toEqual([
      `GET https://api.test/client/me/occurrence-conversations/${REF}`,
      `POST https://api.test/client/me/occurrence-conversations/${REF}/messages`,
      `POST https://api.test/client/me/occurrence-conversations/${REF}/read`,
    ])
    const sent = calls[1]?.init
    expect(sent?.body).toBe(JSON.stringify({ body: 'Mandei a nota.' }))
    expect(new Headers(sent?.headers).get('idempotency-key')).toBe('portal-message:abc-123-def-456')
  })
})

describe('o rascunho, o dia e o lado da mensagem (spec 183 T653)', () => {
  test('o rascunho sai aparado, e diz o que falta', () => {
    expect(validateConversationDraft('  Mandei a nota.  ')).toEqual({
      body: 'Mandei a nota.',
      ok: true,
    })
    expect(validateConversationDraft('   ')).toEqual({ message: 'Escreva a mensagem.', ok: false })
    expect(validateConversationDraft('x'.repeat(8001))).toEqual({
      message: 'A mensagem passa de 8.000 caracteres.',
      ok: false,
    })
  })

  test('a chave de idempotência cabe no formato que a API aceita', () => {
    const key = createConversationIdempotencyKey()

    expect(key).toMatch(/^portal-message:[A-Za-z0-9._:-]{16,}$/u)
    expect(createConversationIdempotencyKey()).not.toBe(key)
  })

  test('agrupa por dia, na ordem em que chegou', () => {
    const groups = groupConversationByDay(
      [
        message({ createdAt: '2026-09-23T10:00:00.000Z' }),
        message({ createdAt: '2026-09-24T10:00:00.000Z' }),
        message({ createdAt: '2026-09-24T12:00:00.000Z' }),
      ],
      (iso) => iso.slice(0, 10),
    )

    expect(groups.map((group) => [group.day, group.messages.length])).toEqual([
      ['2026-09-23', 1],
      ['2026-09-24', 2],
    ])
  })

  /** D9: a contratante lê, então ela fica à direita; a cor segue o participante, não o lado. */
  test('a contratante fica à direita, em azul; a transportadora à esquerda, em cobre', () => {
    expect(describePortalMessage(message())).toEqual({
      align: 'left',
      author: 'Transportadora',
      channel: 'por e-mail',
      tone: 'carrier',
    })
    expect(
      describePortalMessage(message({ channel: 'portal', mine: true, side: 'contractor' })),
    ).toEqual({ align: 'right', author: 'Você', channel: 'pelo portal', tone: 'contractor' })
    expect(describePortalMessage(message({ channel: 'whatsapp', side: 'contractor' }))).toEqual({
      align: 'right',
      author: 'Sua equipe',
      channel: 'pelo WhatsApp',
      tone: 'contractor',
    })
  })

  test('o botão da conversa diz quantas novas', () => {
    expect(conversationToggleLabel(0)).toBe('Conversa com a transportadora')
    expect(conversationToggleLabel(1)).toBe('Conversa com a transportadora (1 nova)')
    expect(conversationToggleLabel(3)).toBe('Conversa com a transportadora (3 novas)')
  })
})

describe('a conversa do portal por texto de fonte (spec 183 T653, ADR-0073)', () => {
  async function sources(): Promise<readonly { readonly file: string; readonly text: string }[]> {
    const files = await readdir('src', { recursive: true })
    return Promise.all(
      files
        .filter((file) => /\.(ts|tsx|css)$/u.test(file))
        .map(async (file) => ({ file, text: await readFile(`src/${file}`, 'utf8') })),
    )
  }

  test('usa as peças do pacote, sem o styles.css dele (regra global) e sem Tailwind', async () => {
    const component = await readFile(
      'src/modules/occurrences/OccurrenceConversation.component.tsx',
      'utf8',
    )

    expect(component).toContain("from '@adatechnology/conversations-ui'")
    expect(component).toContain('<DateDivider')
    expect(component).toContain('<MessageText')
    for (const source of await sources()) {
      expect(source.text).not.toContain('conversations-ui/styles.css')
    }
  })

  test('nenhum código do portal pede câmera nem microfone', async () => {
    for (const source of await sources()) {
      expect(source.text).not.toMatch(/getUserMedia|MediaRecorder|capture=/u)
    }
    const server = await readFile('server.ts', 'utf8')
    expect(server).toContain("'Permissions-Policy': 'camera=(), geolocation=(), microphone=()'")
  })

  test('a conversa não decide: não chama a decisão nem monta o formulário dela', async () => {
    const component = await readFile(
      'src/modules/occurrences/OccurrenceConversation.component.tsx',
      'utf8',
    )

    expect(component).not.toMatch(/decideOccurrence|useDecideOccurrence|DecisionForm/u)
  })

  /** Revisão de design: no mesmo cartão existe "Enviar decisão"; o botão da conversa diz o que envia. */
  test('o botão da conversa diz que envia mensagem, não decisão', async () => {
    const component = await readFile(
      'src/modules/occurrences/OccurrenceConversation.component.tsx',
      'utf8',
    )

    expect(component).toContain("'Enviar mensagem'")
  })

  test('os tons do balão são cópia por valor dos tokens escuros do painel', async () => {
    const portal = await readFile('src/styles/index.css', 'utf8')
    const panel = await readFile('../frontend-transportada/src/styles/index.css', 'utf8')

    for (const token of ['--color-bubble-out', '--color-bubble-contractor']) {
      const value = new RegExp(`${token}: (#[0-9a-f]{6});`, 'u')
      expect(portal.match(value)?.[1]).toBe(panel.match(value)?.[1])
    }
  })
})

describe('o cartão mostra as novas sem abrir a conversa (spec 183 T653)', () => {
  test('o contador do botão vem da listagem', async () => {
    const page = await readFile('src/modules/occurrences/OccurrenceList.page.tsx', 'utf8')

    expect(page).toContain('unreadCount={occurrence.conversationUnreadCount}')
  })
})
