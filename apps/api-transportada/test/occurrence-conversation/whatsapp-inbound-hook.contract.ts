/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T502 (RF9, D6): o hook da conversa fica na frente do despachante de comandos da spec 144.
 * Mensagem de contato com aceite vai para a conversa (ou para "não atribuída") e para ali; número sem
 * aceite, número desconhecido e o motorista fora de resposta seguem para o despachante, que continua
 * recusando quem não é vinculado — exatamente como hoje. Nenhum log leva telefone ou corpo.
 */
import { describe, expect, test } from 'bun:test'

import type { ConversationSession, WhatsAppMessage } from '@adatechnology/meta-whatsapp-contracts'

import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import type { WhatsAppConversationInboundPort } from '../../src/occurrence-conversation/application/whatsapp-conversation-inbound.port.js'
import { createOccurrenceConversationWhatsAppHook } from '../../src/occurrence-conversation/application/whatsapp-conversation-inbound.service.js'
import type { WhatsAppAttributionInput } from '../../src/occurrence-conversation/domain/whatsapp-attribution.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000183601'
const PHONE = '5511987654321'
const NOW = new Date('2026-09-24T15:00:00.000Z')

function session(): ConversationSession {
  return {
    assignedUserId: null,
    companyId: COMPANY_ID,
    context: {},
    createdAt: '2026-09-24T12:00:00.000Z',
    currentState: 'start',
    humanRequestedAt: null,
    id: 'session-1',
    lastActivity: '2026-09-24T12:00:00.000Z',
    lastAgentReadAt: null,
    lastInboundAt: null,
    mode: 'bot',
    updatedAt: '2026-09-24T12:00:00.000Z',
    whatsappNumber: PHONE,
  }
}

function text(body: string, contextId?: string): WhatsAppMessage {
  return {
    ...(contextId === undefined ? {} : { context: { id: contextId } }),
    from: PHONE,
    id: 'wamid.incoming-1',
    text: { body },
    type: 'text',
  }
}

type Recorded = { kind: string; input: unknown }[]

function createHook(
  context: Omit<WhatsAppAttributionInput, 'replyTo'> & {
    readonly replyTo?: WhatsAppAttributionInput['replyTo']
  },
) {
  const recorded: Recorded = []
  const loaded: unknown[] = []
  const forwarded: WhatsAppMessage[] = []
  const logs: unknown[] = []
  const inbound: WhatsAppConversationInboundPort = {
    async loadAttributionContext(input) {
      loaded.push(input)
      return { replyTo: null, ...context }
    },
    async recordConversationMessage(input) {
      recorded.push({ input, kind: 'conversation' })
    },
    async recordUnassigned(input) {
      recorded.push({ input, kind: 'unassigned' })
    },
  }
  const hook = createOccurrenceConversationWhatsAppHook({
    clock: () => NOW,
    inbound,
    logger: {
      error: (...args: unknown[]) => logs.push(args),
      info: (...args: unknown[]) => logs.push(args),
      warn: (...args: unknown[]) => logs.push(args),
    },
    next: async (message) => {
      forwarded.push(message)
      return { outcome: 'handled' }
    },
    rateLimiter: createRateLimiter(),
  })
  return { forwarded, hook, loaded, logs, recorded }
}

const CONTACT = { contactId: 'contact-1', contractorId: 'contractor-alfa', optedIn: true } as const

describe('o hook da conversa no webhook do WhatsApp (spec 183 T502)', () => {
  test('contato com aceite e uma conversa aberta: a mensagem entra na conversa e para ali', async () => {
    const fixture = createHook({
      openContractorConversations: [
        { contractorId: 'contractor-alfa', conversationId: 'conversation-a' },
      ],
      sender: { contractorContacts: [CONTACT], driverUserId: null },
    })

    const outcome = await fixture.hook(text('Autorizado', 'wamid.ours-1'), session())

    expect(outcome).toEqual({ outcome: 'handled' })
    expect(fixture.loaded).toEqual([
      { companyId: COMPANY_ID, phone: PHONE, replyToProviderMessageId: 'wamid.ours-1' },
    ])
    expect(fixture.recorded).toEqual([
      {
        input: {
          bodyText: 'Autorizado',
          companyId: COMPANY_ID,
          conversationId: 'conversation-a',
          driverUserId: null,
          providerMessageId: 'wamid.incoming-1',
          receivedAt: NOW,
          senderAddress: PHONE,
        },
        kind: 'conversation',
      },
    ])
    expect(fixture.forwarded).toEqual([])
  })

  test('motorista respondendo à conversa dele: entra como mensagem do motorista', async () => {
    const fixture = createHook({
      openContractorConversations: [],
      replyTo: {
        contractorId: null,
        conversationId: 'conversation-driver',
        driverUserId: 'driver-1',
        participant: 'driver',
      },
      sender: { contractorContacts: [], driverUserId: 'driver-1' },
    })

    await fixture.hook(text('Estou na doca', 'wamid.ours-2'), session())

    expect(fixture.recorded).toEqual([
      {
        input: expect.objectContaining({
          conversationId: 'conversation-driver',
          driverUserId: 'driver-1',
          senderAddress: null,
        }),
        kind: 'conversation',
      },
    ])
    expect(fixture.forwarded).toEqual([])
  })

  test('duas conversas abertas: vai para "não atribuída", com o contato quando é um só', async () => {
    const fixture = createHook({
      openContractorConversations: [
        { contractorId: 'contractor-alfa', conversationId: 'conversation-a' },
        { contractorId: 'contractor-alfa', conversationId: 'conversation-b' },
      ],
      sender: { contractorContacts: [CONTACT], driverUserId: null },
    })

    const outcome = await fixture.hook(text('Qual das duas?'), session())

    expect(outcome).toEqual({ outcome: 'handled' })
    expect(fixture.recorded).toEqual([
      {
        input: {
          bodyText: 'Qual das duas?',
          companyId: COMPANY_ID,
          contractorContactId: 'contact-1',
          providerMessageId: 'wamid.incoming-1',
          receivedAt: NOW,
          senderAddress: PHONE,
        },
        kind: 'unassigned',
      },
    ])
  })

  test.each([
    ['número de contato sem aceite (D6)', [{ ...CONTACT, optedIn: false }], null],
    ['número que ninguém cadastrou', [], null],
    ['motorista fora de resposta (fluxo da spec 144)', [], 'driver-1'],
  ])('%s segue para o despachante, sem gravar nada', async (_label, contacts, driverUserId) => {
    const fixture = createHook({
      openContractorConversations: [
        { contractorId: 'contractor-alfa', conversationId: 'conversation-a' },
      ],
      sender: { contractorContacts: contacts, driverUserId },
    })
    const message = text('1')

    await fixture.hook(message, session())

    expect(fixture.recorded).toEqual([])
    expect(fixture.forwarded).toEqual([message])
  })

  test('o texto de botão e a legenda de mídia viram o corpo; o que não tem texto entra vazio', async () => {
    const fixture = createHook({
      openContractorConversations: [
        { contractorId: 'contractor-alfa', conversationId: 'conversation-a' },
      ],
      sender: { contractorContacts: [CONTACT], driverUserId: null },
    })

    await fixture.hook(
      {
        from: PHONE,
        id: 'wamid.button',
        interactive: { button_reply: { id: 'ok', title: 'Aprovado' }, type: 'button_reply' },
        type: 'interactive',
      },
      session(),
    )
    await fixture.hook(
      {
        from: PHONE,
        id: 'wamid.image',
        image: { caption: 'Comprovante', id: 'media-1', mime_type: 'image/jpeg' },
        type: 'image',
      },
      session(),
    )
    await fixture.hook(
      {
        audio: { id: 'media-2', mime_type: 'audio/ogg' },
        from: PHONE,
        id: 'wamid.audio',
        type: 'audio',
      },
      session(),
    )

    expect(fixture.recorded.map((entry) => (entry.input as { bodyText: string }).bodyText)).toEqual(
      ['Aprovado', 'Comprovante', ''],
    )
  })

  test('falha ao gravar não sobe para o webhook, e o log não leva telefone nem corpo', async () => {
    const logs: unknown[] = []
    const hook = createOccurrenceConversationWhatsAppHook({
      clock: () => NOW,
      inbound: {
        loadAttributionContext: async () => ({
          openContractorConversations: [
            { contractorId: 'contractor-alfa', conversationId: 'conversation-a' },
          ],
          replyTo: null,
          sender: { contractorContacts: [CONTACT], driverUserId: null },
        }),
        recordConversationMessage: async () => {
          throw new Error('database down')
        },
        recordUnassigned: async () => undefined,
      },
      logger: {
        error: (...args: unknown[]) => logs.push(args),
        info: (...args: unknown[]) => logs.push(args),
        warn: (...args: unknown[]) => logs.push(args),
      },
      next: async () => ({ outcome: 'handled' }),
      rateLimiter: createRateLimiter(),
    })

    expect(await hook(text('Corpo sigiloso'), session())).toEqual({ outcome: 'handled' })
    const serialized = JSON.stringify(logs)
    expect(serialized).not.toContain(PHONE)
    expect(serialized).not.toContain('Corpo sigiloso')
    expect(logs.length).toBeGreaterThan(0)
  })

  test('acima do teto por número, nada é lido nem gravado', async () => {
    const fixture = createHook({
      openContractorConversations: [
        { contractorId: 'contractor-alfa', conversationId: 'conversation-a' },
      ],
      sender: { contractorContacts: [CONTACT], driverUserId: null },
    })
    for (let index = 0; index < 40; index += 1) {
      await fixture.hook({ ...text('x'), id: `wamid.${String(index)}` }, session())
    }
    expect(fixture.loaded.length).toBeLessThanOrEqual(30)
  })
})
