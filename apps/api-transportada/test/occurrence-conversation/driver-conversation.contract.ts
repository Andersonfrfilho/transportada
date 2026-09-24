/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T601 (RF11): a conversa com o motorista pelo app.
 * - O operador escreve; a mensagem nasce "na fila" (o app confirma entrega e leitura, T604) e vira
 *   aviso na caixa do motorista, com `dedupeKey` = id da mensagem — o reenvio não avisa de novo.
 * - O motorista lê e responde só a conversa **dele**, de ocorrência de viagem **dele**: motorista de
 *   outra viagem não alcança, e nada da conversa com a contratante aparece.
 */
import { describe, expect, test } from 'bun:test'

import type {
  DriverConversationTransactionPort,
  DriverConversationMessageRecord,
} from '../../src/occurrence-conversation/application/driver-conversation.port.js'
import {
  createListMyOccurrenceConversationUseCase,
  createReplyMyOccurrenceConversationUseCase,
  createSendDriverAppMessageUseCase,
} from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000184001'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000184002'
const OPERATOR_ID = '00000000-0000-4000-8000-000000184003'
const DRIVER_USER_ID = '00000000-0000-4000-8000-000000184004'
const DRIVER_ID = '00000000-0000-4000-8000-000000184005'
const NOW = new Date('2026-09-24T17:00:00.000Z')

type State = {
  conversations: { driverUserId: string; id: string }[]
  idempotency: Map<string, { fingerprint: string; response: unknown }>
  messages: Record<string, unknown>[]
  notifications: unknown[]
}

function createFake(
  overrides: Partial<{
    driverOnTrip: boolean
    driverUserId: null | string
    notifierFails: boolean
    occurrenceExists: boolean
  }> = {},
) {
  const state: State = {
    conversations: [],
    idempotency: new Map(),
    messages: [],
    notifications: [],
  }
  const exists = overrides.occurrenceExists ?? true
  const transaction: DriverConversationTransactionPort = {
    async findDriverTarget() {
      if (!exists) return null
      return {
        driverUserId:
          overrides.driverUserId === undefined ? DRIVER_USER_ID : overrides.driverUserId,
        occurrenceKind: 'document',
        occurrenceLabel: 'NF 4512/1',
      }
    },
    async findMyOccurrence({ driverId }) {
      if (!exists || overrides.driverOnTrip === false || driverId !== DRIVER_ID) return null
      return { occurrenceKind: 'document' }
    },
    async findIdempotency({ idempotencyKey, operation }) {
      return (state.idempotency.get(`${operation}:${idempotencyKey}`) as never) ?? null
    },
    async saveIdempotency({ fingerprint, idempotencyKey, operation, response }) {
      state.idempotency.set(`${operation}:${idempotencyKey}`, { fingerprint, response })
    },
    async findOrCreateDriverConversation({ driverUserId }) {
      const found = state.conversations.find((c) => c.driverUserId === driverUserId)
      if (found !== undefined) return { id: found.id }
      const created = { driverUserId, id: `conversation-${String(state.conversations.length + 1)}` }
      state.conversations.push(created)
      return { id: created.id }
    },
    async insertMessage(input) {
      state.messages.push(input)
      return { id: `message-${String(state.messages.length)}` }
    },
    async listDriverMessages() {
      return state.messages.map(
        (message, index): DriverConversationMessageRecord => ({
          authorName: message.direction === 'outbound' ? 'Operadora Lima' : null,
          bodyText: String(message.bodyText),
          createdAt: NOW,
          direction: message.direction as 'inbound' | 'outbound',
          id: `message-${String(index + 1)}`,
          status: (message.status as never) ?? null,
        }),
      )
    },
  }
  const unitOfWork = {
    execute: <T>(operation: (tx: typeof transaction) => Promise<T>) => operation(transaction),
  }
  const fingerprintService = {
    create: async ({ fields }: { fields: readonly Uint8Array[] }) =>
      fields.map((field) => new TextDecoder().decode(field)).join('|'),
  }
  return {
    list: createListMyOccurrenceConversationUseCase({ unitOfWork }),
    reply: createReplyMyOccurrenceConversationUseCase({
      clock: () => NOW,
      fingerprintService,
      unitOfWork,
    }),
    send: createSendDriverAppMessageUseCase({
      clock: () => NOW,
      fingerprintService,
      notifier: {
        notify: async (input) => {
          if (overrides.notifierFails === true) throw new Error('queue down')
          state.notifications.push(input)
        },
      },
      unitOfWork,
    }),
    state,
  }
}

async function failure(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work()
  } catch (error) {
    return error
  }
  return undefined
}

const SEND = {
  actorUserId: OPERATOR_ID,
  bodyText: '  Pode aguardar na doca?  ',
  companyId: COMPANY_ID,
  idempotencyKey: 'driver-app-key-0001',
  occurrenceId: OCCURRENCE_ID,
}

describe('o operador escreve ao motorista pelo app (spec 183 T601)', () => {
  test('a mensagem nasce na fila, na conversa do motorista da viagem, e avisa a caixa dele', async () => {
    const fake = createFake()

    const result = await fake.send.send(SEND)

    expect(result).toEqual({ conversationId: 'conversation-1', conversationMessageId: 'message-1' })
    expect(fake.state.messages).toEqual([
      {
        authorUserId: OPERATOR_ID,
        bodyText: 'Pode aguardar na doca?',
        companyId: COMPANY_ID,
        conversationId: 'conversation-1',
        createdAt: NOW,
        direction: 'outbound',
        driverUserId: null,
        idempotencyKey: 'driver-app-key-0001',
        status: 'queued',
        statusTimes: { queued: NOW.toISOString() },
      },
    ])
    expect(fake.state.notifications).toEqual([
      {
        companyId: COMPANY_ID,
        dedupeKey: 'message-1',
        occurrenceLabel: 'NF 4512/1',
        recipientUserId: DRIVER_USER_ID,
      },
    ])
  })

  test('a mesma chave devolve o mesmo resultado, sem outra mensagem nem outro aviso', async () => {
    const fake = createFake()
    const first = await fake.send.send(SEND)
    const again = await fake.send.send(SEND)

    expect(again).toEqual(first)
    expect(fake.state.messages).toHaveLength(1)
    expect(fake.state.notifications).toHaveLength(1)
    expect(await failure(() => fake.send.send({ ...SEND, bodyText: 'Outro texto' }))).toMatchObject(
      { code: 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED', status: 409 },
    )
  })

  test('viagem sem motorista com vínculo é 422; ocorrência de outra empresa é 404; texto vazio é 422', async () => {
    expect(await failure(() => createFake({ driverUserId: null }).send.send(SEND))).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_DRIVER_UNKNOWN',
      status: 422,
    })
    expect(
      await failure(() => createFake({ occurrenceExists: false }).send.send(SEND)),
    ).toMatchObject({ code: 'TRIP_OCCURRENCE_NOT_FOUND', status: 404 })
    expect(await failure(() => createFake().send.send({ ...SEND, bodyText: '   ' }))).toMatchObject(
      { code: 'OCCURRENCE_CONVERSATION_MESSAGE_INVALID', status: 422 },
    )
  })
})

describe('o aviso é conveniência (spec 183 T601)', () => {
  test('o aviso que falha não desfaz a mensagem', async () => {
    const fake = createFake({ notifierFails: true })
    expect(await fake.send.send(SEND)).toEqual({
      conversationId: 'conversation-1',
      conversationMessageId: 'message-1',
    })
    expect(fake.state.messages).toHaveLength(1)
  })
})

describe('o motorista lê e responde a conversa dele (spec 183 T601)', () => {
  const MINE = {
    companyId: COMPANY_ID,
    driverId: DRIVER_ID,
    driverUserId: DRIVER_USER_ID,
    occurrenceId: OCCURRENCE_ID,
  }

  test('lê as mensagens da conversa dele, com o nome de quem escreveu da operação', async () => {
    const fake = createFake()
    await fake.send.send(SEND)

    expect(await fake.list.list(MINE)).toEqual([
      {
        authorName: 'Operadora Lima',
        bodyText: 'Pode aguardar na doca?',
        createdAt: NOW.toISOString(),
        direction: 'outbound',
        id: 'message-1',
        status: 'queued',
      },
    ])
  })

  test('responde na conversa dele, com a chave de idempotência', async () => {
    const fake = createFake()
    await fake.send.send(SEND)

    const reply = await fake.reply.reply({
      ...MINE,
      bodyText: 'Aguardo sim.',
      idempotencyKey: 'driver-reply-key-0001',
    })
    await fake.reply.reply({
      ...MINE,
      bodyText: 'Aguardo sim.',
      idempotencyKey: 'driver-reply-key-0001',
    })

    expect(reply).toEqual({ conversationId: 'conversation-1', messageId: 'message-2' })
    expect(fake.state.messages.at(-1)).toEqual({
      authorUserId: null,
      bodyText: 'Aguardo sim.',
      companyId: COMPANY_ID,
      conversationId: 'conversation-1',
      createdAt: NOW,
      direction: 'inbound',
      driverUserId: DRIVER_USER_ID,
      idempotencyKey: 'driver-reply-key-0001',
      status: null,
      statusTimes: {},
    })
    expect(fake.state.messages).toHaveLength(2)
  })

  test('motorista de outra viagem não alcança: 404 na leitura e na resposta', async () => {
    const fake = createFake({ driverOnTrip: false })
    expect(await failure(() => fake.list.list(MINE))).toMatchObject({
      code: 'TRIP_OCCURRENCE_NOT_FOUND',
      status: 404,
    })
    expect(
      await failure(() =>
        fake.reply.reply({ ...MINE, bodyText: 'Oi', idempotencyKey: 'driver-reply-key-0002' }),
      ),
    ).toMatchObject({ code: 'TRIP_OCCURRENCE_NOT_FOUND', status: 404 })
    expect(fake.state.messages).toEqual([])
  })
})
