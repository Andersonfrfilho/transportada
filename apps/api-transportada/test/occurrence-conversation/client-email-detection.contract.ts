/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T4b (RF8): a extração única do e-mail na mensagem do motorista, com mensagens como elas chegam de verdade;
 * o "1" do WhatsApp; e o hook do WhatsApp entregando ao reconhecimento só a mensagem do motorista gravada agora.
 */
import { describe, expect, test } from 'bun:test'

import type { ConversationSession, WhatsAppMessage } from '@adatechnology/meta-whatsapp-contracts'

import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import {
  createDetectedClientEmailUseCase,
  type DriverMessageInput,
} from '../../src/occurrence-conversation/application/detected-client-email.use-case.js'
import type { DetectedClientEmailStorePort } from '../../src/occurrence-conversation/application/detected-client-email.port.js'
import { createOccurrenceConversationWhatsAppHook } from '../../src/occurrence-conversation/application/whatsapp-conversation-inbound.service.js'
import {
  buildDetectedEmailWhatsAppPrompt,
  detectClientEmailAddress,
  isDetectedEmailConfirmation,
} from '../../src/occurrence-conversation/domain/client-email-detection.policy.js'

describe('a extração do e-mail digitado na conversa (spec 279 T4b)', () => {
  test.each([
    ['manda pra fulano@mercado.com', 'fulano@mercado.com'],
    ['Manda pra Fulano@Mercado.com.br.', 'Fulano@Mercado.com.br'],
    ['o e-mail é: financeiro@mercado.com, valeu', 'financeiro@mercado.com'],
    ['(compras@mercado.com)', 'compras@mercado.com'],
    ['<dono@mercado.com>', 'dono@mercado.com'],
    ['mailto:dono@mercado.com', 'dono@mercado.com'],
    ['manda pra a@b.co e copia c@d.com', 'a@b.co'],
    ['primeiro inválido x@y depois certo@mercado.com', 'certo@mercado.com'],
    [
      'email\nnota.fiscal+boleto@mercado-sul.com.br\nobrigado',
      'nota.fiscal+boleto@mercado-sul.com.br',
    ],
  ])('%p → %p', (text, expected) => {
    expect(detectClientEmailAddress(text)).toBe(expected)
  })

  test.each([
    'Bom dia, chegando no cliente',
    'manda pra a***@m***.com',
    'f***@mercado.com',
    'fulano@',
    '@mercado.com',
    'fulano@mercado',
    'fulano@@mercado.com',
    `${'a'.repeat(250)}@mercado.com`,
    '',
  ])('sem endereço válido: %p', (text) => {
    expect(detectClientEmailAddress(text)).toBeNull()
  })

  test('só o "1" sozinho confirma; o aviso leva só a forma mascarada', () => {
    expect(isDetectedEmailConfirmation(' 1 ')).toBe(true)
    expect(isDetectedEmailConfirmation('1.')).toBe(false)
    expect(isDetectedEmailConfirmation('11')).toBe(false)
    expect(isDetectedEmailConfirmation('sim')).toBe(false)
    expect(buildDetectedEmailWhatsAppPrompt('f***@m***.com')).toBe(
      'Enviar o boleto para f***@m***.com?\nResponda a esta mensagem com 1 para enviar.',
    )
  })
})

const COMPANY_ID = '00000000-0000-4000-8000-000000279401'
const PHONE = '5511987654321'

function fakeStore(overrides: Partial<DetectedClientEmailStorePort> = {}) {
  const writes: unknown[] = []
  const store: DetectedClientEmailStorePort = {
    findDetected: async () => null,
    findDriverOccurrence: async () => 'occurrence-1',
    findPending: async () => null,
    markDetected: async (params) => void writes.push({ markDetected: params }),
    markSent: async (params) => void writes.push({ markSent: params.messageId }),
    readSendState: async () => ({
      boletoAccepted: true,
      clientEmailSendMode: 'manual',
      clientEmailType: 'boleto',
    }),
    recordWhatsAppPrompt: async (params) => void writes.push({ prompt: params.bodyText }),
    ...overrides,
  }
  return { store, writes }
}

function input(bodyText: string, sent: string[] = []): DriverMessageInput {
  return {
    bodyText,
    channel: {
      kind: 'whatsapp',
      send: async (body) => {
        sent.push(body)
        return { externalMessageId: 'wamid.out-1' }
      },
    },
    companyId: COMPANY_ID,
    conversationId: 'conversation-driver',
    correlationId: 'correlation-1',
    driverUserId: 'driver-1',
    messageId: 'message-1',
  }
}

describe('o reconhecimento na conversa (spec 279 T4b, RF8/RF10b)', () => {
  test('manual: marca, avisa no WhatsApp com a forma mascarada e não envia', async () => {
    const { store, writes } = fakeStore()
    const forwarded: unknown[] = []
    const logs: unknown[] = []
    const useCase = createDetectedClientEmailUseCase({
      clock: () => new Date('2026-10-26T22:00:00.000Z'),
      forwardByEmail: {
        forwardToClient: async (params) => (
          forwarded.push(params),
          { results: [], savedEmailId: null }
        ),
      },
      logger: {
        error: () => undefined,
        info: (...args) => logs.push(args),
        warn: (...args) => logs.push(args),
      },
      store,
    })
    const sent: string[] = []

    expect(await useCase.onDriverMessage(input('manda pra fulano@mercado.com', sent))).toEqual({
      addressMasked: 'f***@m***.com',
      kind: 'awaiting_confirmation',
    })
    expect(forwarded).toEqual([])
    expect(sent).toEqual([buildDetectedEmailWhatsAppPrompt('f***@m***.com')])
    expect(writes).toEqual([
      {
        markDetected: {
          address: 'fulano@mercado.com',
          companyId: COMPANY_ID,
          messageId: 'message-1',
        },
      },
      { prompt: buildDetectedEmailWhatsAppPrompt('f***@m***.com') },
    ])
    expect(JSON.stringify(logs)).not.toContain('fulano@mercado.com')
  })

  test('sem boleto aceito, tipo off ou conversa que não é do motorista: nada acontece', async () => {
    for (const overrides of [
      { findDriverOccurrence: async () => null },
      {
        readSendState: async () =>
          ({
            boletoAccepted: false,
            clientEmailSendMode: 'manual',
            clientEmailType: 'boleto',
          }) as const,
      },
      {
        readSendState: async () =>
          ({
            boletoAccepted: true,
            clientEmailSendMode: 'automatic',
            clientEmailType: 'off',
          }) as const,
      },
    ] satisfies Partial<DetectedClientEmailStorePort>[]) {
      const { store, writes } = fakeStore(overrides)
      const useCase = createDetectedClientEmailUseCase({
        clock: () => new Date(),
        forwardByEmail: { forwardToClient: async () => ({ results: [], savedEmailId: null }) },
        store,
      })
      expect(await useCase.onDriverMessage(input('manda pra fulano@mercado.com'))).toEqual({
        kind: 'none',
      })
      expect(writes).toEqual([])
    }
  })

  test('falha do envio nunca sobe: vira "failed" e o log leva só o nome do erro', async () => {
    const { store } = fakeStore({
      readSendState: async () => ({
        boletoAccepted: true,
        clientEmailSendMode: 'automatic',
        clientEmailType: 'boleto',
      }),
    })
    const logs: unknown[] = []
    const useCase = createDetectedClientEmailUseCase({
      clock: () => new Date(),
      forwardByEmail: {
        forwardToClient: async () => {
          throw new Error('limit fulano@mercado.com')
        },
      },
      logger: { error: () => undefined, info: () => undefined, warn: (...args) => logs.push(args) },
      store,
    })
    expect(await useCase.onDriverMessage(input('manda pra fulano@mercado.com'))).toEqual({
      kind: 'failed',
    })
    expect(logs).toEqual([
      [
        'occurrence_conversation_detected_email_failed',
        { channel: 'whatsapp', errorName: 'Error', messageId: 'message-1' },
      ],
    ])
  })
})

function session(): ConversationSession {
  return {
    assignedUserId: null,
    companyId: COMPANY_ID,
    context: {},
    createdAt: '2026-10-26T12:00:00.000Z',
    currentNodeId: null,
    currentState: 'start',
    flowKey: null,
    humanRequestedAt: null,
    id: 'session-1',
    lastActivity: '2026-10-26T12:00:00.000Z',
    lastAgentReadAt: null,
    lastInboundAt: null,
    mode: 'bot',
    updatedAt: '2026-10-26T12:00:00.000Z',
    whatsappNumber: PHONE,
  }
}

function text(body: string, id: string): WhatsAppMessage {
  return {
    context: { id: 'wamid.ours-1' },
    from: PHONE,
    id,
    text: { body },
    timestamp: '1790000000',
    type: 'text',
  }
}

describe('o hook do WhatsApp entrega a mensagem do motorista ao reconhecimento (spec 279 T4b)', () => {
  test('só a do motorista, só gravada agora, e a resposta sai pelo número dele', async () => {
    const handled: { bodyText: string; messageId: string; reply: string }[] = []
    const sentTo: string[] = []
    let recordedId: null | string = 'message-new'
    const hook = createOccurrenceConversationWhatsAppHook({
      clock: () => new Date('2026-10-26T22:00:00.000Z'),
      detectedClientEmail: {
        onDriverMessage: async (params) => {
          if (params.channel.kind === 'whatsapp') await params.channel.send('ok')
          handled.push({
            bodyText: params.bodyText,
            messageId: params.messageId,
            reply: params.channel.kind,
          })
          return { kind: 'none' }
        },
      },
      inbound: {
        loadAttributionContext: async () => ({
          openContractorConversations: [],
          replyTo: {
            contractorId: null,
            conversationId: 'conversation-driver',
            driverUserId: 'driver-1',
            participant: 'driver',
          },
          sender: { contractorContacts: [], driverUserId: 'driver-1' },
        }),
        recordConversationMessage: async () => recordedId,
        recordUnassigned: async () => undefined,
      },
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      next: async () => ({ outcome: 'handled' }),
      rateLimiter: createRateLimiter(),
      sendText: async (to) => {
        sentTo.push(to)
        return { externalMessageId: 'wamid.out' }
      },
    })

    await hook(text('manda pra fulano@mercado.com', 'wamid.in-1'), session())
    recordedId = null
    await hook(text('manda pra fulano@mercado.com', 'wamid.in-1'), session())

    expect(handled).toEqual([
      { bodyText: 'manda pra fulano@mercado.com', messageId: 'message-new', reply: 'whatsapp' },
    ])
    expect(sentTo).toEqual([PHONE])
  })
})
