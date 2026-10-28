/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T6 (D6, RF4): o que chega pelo número do Evolution entra no fio — a conversa citada, a
 * única conversa aberta do contato — ou em "não atribuídas", nunca no lixo. A resposta do cliente ao
 * boleto entra quando vem do mesmo número que o recebeu. Nenhum log leva número ou texto.
 */
import { describe, expect, test } from 'bun:test'

import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import {
  createEvolutionConversationInbound,
  type EvolutionConversationInboundPort,
} from '../../src/occurrence-conversation/application/evolution-conversation-inbound.service.js'
import { resolveEvolutionAttribution } from '../../src/occurrence-conversation/domain/evolution-attribution.policy.js'
import type { WhatsAppAttributionInput } from '../../src/occurrence-conversation/domain/whatsapp-attribution.policy.js'
import type { ApiLogger } from '../../src/shared/api.types.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000281601'
const PHONE = '5516999998888'
/** O mesmo celular sem o nono dígito: a chave do WhatsApp casa as duas grafias. */
const PHONE_WITHOUT_NINTH = '551699998888'
const NOW = new Date('2026-10-27T19:00:00.000Z')
const TEXT = 'recebi, vou pagar amanhã'

const NOBODY: WhatsAppAttributionInput = {
  openContractorConversations: [],
  replyTo: null,
  sender: { contractorContacts: [], driverUserId: null },
}

const driverReply = {
  contractorId: null,
  conversationId: 'conversation-driver',
  driverUserId: 'driver-1',
  participant: 'driver' as const,
}

describe('política do Evolution', () => {
  test('quem recebeu o boleto responde citando o aviso e cai na conversa dele', () => {
    expect(
      resolveEvolutionAttribution({
        ...NOBODY,
        replyTo: driverReply,
        replyToRecipientPhoneKey: '551699998888',
        senderPhoneKey: '551699998888',
      }),
    ).toEqual({
      conversationId: 'conversation-driver',
      driverUserId: null,
      kind: 'conversation',
      via: 'recipient_reply',
    })
  })

  test('outro número citando o mesmo aviso não entra na conversa', () => {
    expect(
      resolveEvolutionAttribution({
        ...NOBODY,
        replyTo: driverReply,
        replyToRecipientPhoneKey: '551699998888',
        senderPhoneKey: '551188887777',
      }),
    ).toEqual({ kind: 'unassigned', reason: 'not_a_contact' })
  })

  test('o motorista respondendo a própria conversa entra como ele mesmo', () => {
    expect(
      resolveEvolutionAttribution({
        ...NOBODY,
        replyTo: driverReply,
        replyToRecipientPhoneKey: null,
        sender: { contractorContacts: [], driverUserId: 'driver-1' },
        senderPhoneKey: '551699998888',
      }),
    ).toEqual({
      conversationId: 'conversation-driver',
      driverUserId: 'driver-1',
      kind: 'conversation',
      via: 'reply',
    })
  })

  test('contato com aceite e uma conversa aberta vai para ela; duas ficam para o operador', () => {
    const sender = {
      contractorContacts: [{ contactId: 'contact-1', contractorId: 'contractor-1', optedIn: true }],
      driverUserId: null,
    }
    const one = [{ contractorId: 'contractor-1', conversationId: 'conversation-1' }]
    const base = { replyTo: null, replyToRecipientPhoneKey: null, sender, senderPhoneKey: 'k' }

    expect(resolveEvolutionAttribution({ ...base, openContractorConversations: one })).toEqual({
      conversationId: 'conversation-1',
      driverUserId: null,
      kind: 'conversation',
      via: 'single_open',
    })
    expect(
      resolveEvolutionAttribution({
        ...base,
        openContractorConversations: [
          ...one,
          { contractorId: 'contractor-1', conversationId: 'conversation-2' },
        ],
      }),
    ).toEqual({ kind: 'unassigned', reason: 'ambiguous' })
  })

  test('motorista sem citar e número desconhecido vão para não atribuídas, nunca recusados', () => {
    const base = { openContractorConversations: [], replyTo: null, replyToRecipientPhoneKey: null }

    expect(
      resolveEvolutionAttribution({
        ...base,
        sender: { contractorContacts: [], driverUserId: 'driver-1' },
        senderPhoneKey: 'k',
      }),
    ).toEqual({ kind: 'unassigned', reason: 'no_open_conversation' })
    expect(resolveEvolutionAttribution({ ...base, ...NOBODY, senderPhoneKey: 'k' })).toEqual({
      kind: 'unassigned',
      reason: 'not_a_contact',
    })
  })
})

function createInbound(
  options: { context?: WhatsAppAttributionInput; recipient?: null | string } = {},
) {
  const recorded: { kind: string; input: unknown }[] = []
  const loaded: unknown[] = []
  const recipients: unknown[] = []
  const statuses: unknown[] = []
  const logs: unknown[] = []
  const port: EvolutionConversationInboundPort = {
    async findReplyRecipient(input) {
      recipients.push(input)
      return options.recipient ?? null
    },
    async loadAttributionContext(input) {
      loaded.push(input)
      return options.context ?? NOBODY
    },
    async recordConversationMessage(input) {
      recorded.push({ input, kind: 'conversation' })
      return 'message-1'
    },
    async recordUnassigned(input) {
      recorded.push({ input, kind: 'unassigned' })
    },
  }
  const record = (message: string, fields: unknown) => logs.push({ fields, message })
  const inbound = createEvolutionConversationInbound({
    applyStatus: async (input) => {
      statuses.push(input)
    },
    clock: () => NOW,
    inbound: port,
    logger: { error: record, info: record, warn: record } as unknown as ApiLogger,
    rateLimiter: createRateLimiter(),
  })
  return { inbound, loaded, logs, recipients, recorded, statuses }
}

const message = (
  overrides: Partial<{ from: string; replyTo: null | string; text: null | string }>,
) => ({
  from: overrides.from ?? PHONE,
  providerMessageId: 'EVO-IN-1',
  replyToProviderMessageId: overrides.replyTo ?? null,
  text: 'text' in overrides ? (overrides.text ?? null) : TEXT,
})

describe('recebimento pelo Evolution', () => {
  test('a resposta do cliente ao boleto entra na conversa com o número como chegou', async () => {
    const { inbound, recipients, recorded } = createInbound({
      context: { ...NOBODY, replyTo: driverReply },
      recipient: `+${PHONE_WITHOUT_NINTH}`,
    })

    const outcome = await inbound.receiveMessage({
      companyId: COMPANY_ID,
      message: message({ replyTo: 'EVO-OUT-1' }),
    })

    expect(outcome).toBe('conversation')
    expect(recipients).toEqual([{ companyId: COMPANY_ID, replyToProviderMessageId: 'EVO-OUT-1' }])
    expect(recorded).toEqual([
      {
        input: {
          bodyText: TEXT,
          companyId: COMPANY_ID,
          conversationId: 'conversation-driver',
          driverUserId: null,
          providerMessageId: 'EVO-IN-1',
          receivedAt: NOW,
          senderAddress: PHONE,
        },
        kind: 'conversation',
      },
    ])
  })

  test('sem conversa, a mensagem vai para não atribuídas; sem citação, nem procura destinatário', async () => {
    const { inbound, recipients, recorded } = createInbound()

    expect(
      await inbound.receiveMessage({ companyId: COMPANY_ID, message: message({ text: null }) }),
    ).toBe('unassigned')
    expect(recipients).toEqual([])
    expect(recorded).toEqual([
      {
        input: {
          bodyText: '',
          companyId: COMPANY_ID,
          contractorContactId: null,
          providerMessageId: 'EVO-IN-1',
          receivedAt: NOW,
          senderAddress: PHONE,
        },
        kind: 'unassigned',
      },
    ])
  })

  test('número que não é telefone não chega ao banco', async () => {
    const { inbound, loaded } = createInbound()

    for (const from of ['', '123', '1203630000000000001234']) {
      expect(
        await inbound.receiveMessage({ companyId: COMPANY_ID, message: message({ from }) }),
      ).toBe('ignored')
    }
    expect(loaded).toEqual([])
  })

  test('o mesmo número insistindo esbarra no teto', async () => {
    const { inbound } = createInbound()

    const outcomes = []
    for (let index = 0; index < 31; index += 1) {
      outcomes.push(await inbound.receiveMessage({ companyId: COMPANY_ID, message: message({}) }))
    }

    expect(outcomes.at(-1)).toBe('rate_limited')
  })

  test('falha ao gravar não sobe e o log leva só o nome do erro', async () => {
    const recorded = createInbound()
    const failing = createEvolutionConversationInbound({
      applyStatus: async () => {
        throw new TypeError('db down')
      },
      clock: () => NOW,
      inbound: {
        findReplyRecipient: async () => null,
        loadAttributionContext: async () => {
          throw new TypeError('db down')
        },
        recordConversationMessage: async () => null,
        recordUnassigned: async () => undefined,
      },
      logger: {
        error: (message: string, fields: unknown) => recorded.logs.push({ fields, message }),
      } as unknown as ApiLogger,
      rateLimiter: createRateLimiter(),
    })

    expect(await failing.receiveMessage({ companyId: COMPANY_ID, message: message({}) })).toBe(
      'failed',
    )
    await failing.receiveStatus({ companyId: COMPANY_ID, providerMessageId: 'X', status: 'read' })

    expect(recorded.logs).toEqual([
      {
        fields: { companyId: COMPANY_ID, errorName: 'TypeError' },
        message: 'occurrence_conversation_evolution_failed',
      },
      {
        fields: { companyId: COMPANY_ID, errorName: 'TypeError' },
        message: 'occurrence_conversation_evolution_status_failed',
      },
    ])
    expect(JSON.stringify(recorded.logs)).not.toContain(PHONE)
  })

  test('o status vai ao selo com o horário do recebimento', async () => {
    const { inbound, statuses } = createInbound()

    await inbound.receiveStatus({
      companyId: COMPANY_ID,
      providerMessageId: 'EVO-OUT-1',
      status: 'delivered',
    })
    await inbound.receiveStatus({ companyId: COMPANY_ID, providerMessageId: '', status: 'read' })

    expect(statuses).toEqual([
      { at: NOW, companyId: COMPANY_ID, incoming: 'delivered', providerMessageId: 'EVO-OUT-1' },
    ])
  })
})
