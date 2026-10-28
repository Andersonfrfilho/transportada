/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 283 T5 (D6, RF7): a resposta do painel ao cliente. O número sai do alvo da faixa, o primeiro envio pede
 * confirmação, o WhatsApp desligado não grava nada, a mesma chave não envia duas vezes e o log não leva número nem
 * texto.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ClientReplyContext,
  ClientReplyRepositoryPort,
  ClientReplyWhatsAppSenderPort,
} from '../../src/occurrence-conversation/application/send-client-reply.port.js'
import { createSendClientReplyUseCase } from '../../src/occurrence-conversation/application/send-client-reply.use-case.js'
import { ContractorReplyWhatsAppSendError } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.port.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000283701'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000283702'
const DELIVERY_ID = '00000000-0000-4000-8000-000000283703'
const NUMBER = '+5516999991234'

const CONTEXT: ClientReplyContext = {
  clientChannel: 'whatsapp',
  contacts: [{ address: NUMBER, channel: 'whatsapp' }],
  conversationId: 'conversation-client',
  evolutionStatus: 'active',
  messages: [
    {
      address: NUMBER,
      channel: 'whatsapp',
      createdAt: '2026-10-27T10:00:00.000Z',
      deliveryId: DELIVERY_ID,
      direction: 'outbound',
      status: 'sent',
    },
  ],
}

const INPUT = {
  actorUserId: 'user-1',
  bodyText: 'Bom dia, segue o boleto.',
  companyId: COMPANY_ID,
  confirmNumber: true,
  correlationId: 'correlation-1',
  idempotencyKey: 'client-reply-key-0001',
  occurrenceId: OCCURRENCE_ID,
  replyTargetId: DELIVERY_ID,
}

function createFixture(params: {
  readonly connected?: boolean
  readonly context?: ClientReplyContext | null
  readonly existing?: { readonly id: string; readonly status: 'failed' | 'queued' | 'sent' }
  readonly sendError?: Error
}) {
  const events: string[] = []
  const logs: unknown[] = []
  const texts: unknown[] = []
  const repository: ClientReplyRepositoryPort = {
    findByIdempotencyKey: async () => params.existing ?? null,
    insertQueued: async (input) => {
      events.push(`insert:${input.recipientAddress}`)
      return { id: 'message-1' }
    },
    markFailed: async () => {
      events.push('failed')
    },
    markSent: async (input) => {
      events.push(`sent:${input.providerMessageId}`)
    },
    readContext: async () => (params.context === undefined ? CONTEXT : params.context),
  }
  const sender: ClientReplyWhatsAppSenderPort = {
    isConnected: async () => params.connected ?? true,
    sendText: async (input) => {
      texts.push(input)
      if (params.sendError !== undefined) throw params.sendError
      return { providerMessageId: 'evolution-1' }
    },
  }
  const useCase = createSendClientReplyUseCase({
    logger: { warn: (...args: unknown[]) => logs.push(args) },
    repository,
    sender,
  })
  return { events, logs, texts, useCase }
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    return (error as { code: string }).code
  }
  return 'no error'
}

describe('a resposta do painel ao cliente (spec 283 T5)', () => {
  test('envia ao número do alvo, grava queued antes e sent com o id do provedor depois', async () => {
    const fixture = createFixture({})
    expect(await fixture.useCase.send(INPUT)).toEqual({
      messageId: 'message-1',
      replayed: false,
      status: 'sent',
    })
    expect(fixture.events).toEqual([`insert:${NUMBER}`, 'sent:evolution-1'])
    expect(fixture.texts).toEqual([{ body: INPUT.bodyText, companyId: COMPANY_ID, number: NUMBER }])
  })

  test('primeiro envio sem confirmação: 409 com o número mascarado, nada gravado nem enviado', async () => {
    const fixture = createFixture({})
    let caught: unknown
    try {
      await fixture.useCase.send({ ...INPUT, confirmNumber: false })
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({
      code: 'OCCURRENCE_CLIENT_REPLY_CONFIRMATION_REQUIRED',
      details: [{ field: 'confirmNumber', message: '+55 ••••1234' }],
      status: 409,
    })
    expect(fixture.events).toEqual([])
    expect(fixture.texts).toEqual([])
  })

  test('número já confirmado por uma resposta anterior dispensa a confirmação', async () => {
    const fixture = createFixture({
      context: {
        ...CONTEXT,
        messages: [
          ...CONTEXT.messages,
          {
            address: NUMBER,
            channel: 'whatsapp',
            createdAt: '2026-10-27T10:05:00.000Z',
            deliveryId: null,
            direction: 'outbound',
            panelReply: true,
            status: 'sent',
          },
        ],
      },
    })
    expect((await fixture.useCase.send({ ...INPUT, confirmNumber: false })).status).toBe('sent')
  })

  test('a mesma chave devolve a mensagem gravada sem enviar de novo', async () => {
    const fixture = createFixture({ existing: { id: 'message-0', status: 'sent' } })
    expect(await fixture.useCase.send(INPUT)).toEqual({
      messageId: 'message-0',
      replayed: true,
      status: 'sent',
    })
    expect(fixture.events).toEqual([])
    expect(fixture.texts).toEqual([])
  })

  test('WhatsApp desligado no tipo, Evolution sem configuração, desativado ou fora do ar: nada gravado', async () => {
    const cases: [Parameters<typeof createFixture>[0], string][] = [
      [{ context: { ...CONTEXT, clientChannel: 'email' } }, 'OCCURRENCE_CLIENT_WHATSAPP_OFF'],
      [{ context: { ...CONTEXT, evolutionStatus: null } }, 'WHATSAPP_EVOLUTION_NOT_CONFIGURED'],
      [{ context: { ...CONTEXT, evolutionStatus: 'disabled' } }, 'WHATSAPP_EVOLUTION_DISABLED'],
      [{ connected: false }, 'WHATSAPP_EVOLUTION_UNAVAILABLE'],
    ]
    for (const [params, code] of cases) {
      const fixture = createFixture(params)
      expect(await errorCode(fixture.useCase.send(INPUT))).toBe(code)
      expect(fixture.events).toEqual([])
    }
  })

  test('sem conversa do cliente, alvo de outra conversa ou contato removido: 404 sem dizer qual', async () => {
    for (const fixture of [
      createFixture({ context: null }),
      createFixture({ context: { ...CONTEXT, contacts: [] } }),
    ]) {
      expect(await errorCode(fixture.useCase.send(INPUT))).toBe('TRIP_OCCURRENCE_NOT_FOUND')
    }
    const other = createFixture({})
    expect(
      await errorCode(other.useCase.send({ ...INPUT, replyTargetId: crypto.randomUUID() })),
    ).toBe('TRIP_OCCURRENCE_NOT_FOUND')
    expect(other.events).toEqual([])
  })

  test('o provedor recusa: a mensagem vira failed e o log leva só ids (RF7)', async () => {
    const fixture = createFixture({ sendError: new ContractorReplyWhatsAppSendError('failed') })
    expect((await fixture.useCase.send(INPUT)).status).toBe('failed')
    expect(fixture.events).toEqual([`insert:${NUMBER}`, 'failed'])
    const logged = JSON.stringify(fixture.logs)
    expect(logged).not.toContain('99991234')
    expect(logged).not.toContain('boleto')
  })
})
