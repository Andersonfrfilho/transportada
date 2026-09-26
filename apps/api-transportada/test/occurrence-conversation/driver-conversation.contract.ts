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
  createListMyConversationsUseCase,
  createListMyOccurrenceConversationUseCase,
  createMarkMyConversationReadUseCase,
  createReplyMyOccurrenceConversationUseCase,
  createSendDriverAppMessageUseCase,
} from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import {
  listNoAttachments,
  NO_ATTACHMENTS,
  UNUSED_ATTACHMENT_STORAGE,
} from '../fixtures/conversation-attachment.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000184001'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000184002'
const OPERATOR_ID = '00000000-0000-4000-8000-000000184003'
const DRIVER_USER_ID = '00000000-0000-4000-8000-000000184004'
const DRIVER_ID = '00000000-0000-4000-8000-000000184005'
const NOW = new Date('2026-09-24T17:00:00.000Z')

type State = {
  conversations: { driverUserId: string; id: string }[]
  /** O motorista principal da viagem agora (posição 1) e a tripulação, `driverId` → usuário. */
  crew: Map<string, string>
  target: null | string
  idempotency: Map<string, { fingerprint: string; response: unknown }>
  messages: Record<string, unknown>[]
  notifications: unknown[]
  statusCalls: unknown[]
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
    crew: new Map([[DRIVER_ID, DRIVER_USER_ID]]),
    target: overrides.driverUserId === undefined ? DRIVER_USER_ID : overrides.driverUserId,
    idempotency: new Map(),
    messages: [],
    notifications: [],
    statusCalls: [],
  }
  const exists = overrides.occurrenceExists ?? true
  const transaction: DriverConversationTransactionPort = {
    attachments: NO_ATTACHMENTS,
    listAttachments: listNoAttachments,
    async applyDriverStatus(input) {
      state.statusCalls.push(input)
    },
    async listMyConversations() {
      return [
        {
          lastMessageAt: NOW,
          occurrenceId: OCCURRENCE_ID,
          occurrenceLabel: 'NF 4512/1',
          unreadCount: 1,
        },
      ]
    },
    async findDriverTarget() {
      if (!exists) return null
      return {
        driverUserId: state.target,
        occurrenceKind: 'document',
        occurrenceLabel: 'NF 4512/1',
      }
    },
    async findMyOccurrence({ driverId }) {
      if (!exists || overrides.driverOnTrip === false || !state.crew.has(driverId)) return null
      return { occurrenceKind: 'document' }
    },
    async findIdempotency({ idempotencyKey, operation }) {
      return (state.idempotency.get(`${operation}:${idempotencyKey}`) as never) ?? null
    },
    async saveIdempotency({ fingerprint, idempotencyKey, operation, response }) {
      state.idempotency.set(`${operation}:${idempotencyKey}`, { fingerprint, response })
    },
    /** Como o banco: uma conversa de motorista por ocorrência, com o destinatário dela. */
    async findOrCreateDriverConversation({ driverUserId, retarget }) {
      const [found] = state.conversations
      if (found === undefined) {
        const created = { driverUserId, id: 'conversation-1' }
        state.conversations.push(created)
        return { ...created }
      }
      if (retarget) found.driverUserId = driverUserId
      return { ...found }
    },
    async insertMessage(input) {
      state.messages.push(input)
      return { id: `message-${String(state.messages.length)}` }
    },
    async listDriverMessages({ driverUserId }) {
      if (state.conversations[0]?.driverUserId !== driverUserId) return []
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
    inbox: createListMyConversationsUseCase({ clock: () => NOW, unitOfWork }),
    list: createListMyOccurrenceConversationUseCase({
      clock: () => NOW,
      storage: UNUSED_ATTACHMENT_STORAGE,
      unitOfWork,
    }),
    markRead: createMarkMyConversationReadUseCase({ clock: () => NOW, unitOfWork }),
    reply: createReplyMyOccurrenceConversationUseCase({
      clock: () => NOW,
      fingerprintService,
      storage: UNUSED_ATTACHMENT_STORAGE,
      unitOfWork,
    }),
    send: createSendDriverAppMessageUseCase({
      clock: () => NOW,
      fingerprintService,
      storage: UNUSED_ATTACHMENT_STORAGE,
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
        attachments: [],
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

/**
 * Spec 183 T903 (achado C1): a conversa do motorista é uma por ocorrência, e o destinatário é o
 * motorista principal da viagem. Quando ele muda, a próxima mensagem da operação passa a conversa ao
 * novo — que lê o histórico —, e o anterior deixa de lê-la. Quem não é o destinatário não responde
 * nela: a resposta iria para uma conversa que ele não vê.
 */
describe('a troca do motorista principal (spec 183 T903, C1)', () => {
  const NEW_DRIVER_ID = '00000000-0000-4000-8000-000000184006'
  const NEW_DRIVER_USER_ID = '00000000-0000-4000-8000-000000184007'
  const OLD = {
    companyId: COMPANY_ID,
    driverId: DRIVER_ID,
    driverUserId: DRIVER_USER_ID,
    occurrenceId: OCCURRENCE_ID,
  }
  const NEW = { ...OLD, driverId: NEW_DRIVER_ID, driverUserId: NEW_DRIVER_USER_ID }

  function swapped() {
    const fake = createFake()
    fake.state.crew.set(NEW_DRIVER_ID, NEW_DRIVER_USER_ID)
    return fake
  }

  test('a mensagem da operação passa a conversa ao novo, que lê o histórico; o anterior não lê mais', async () => {
    const fake = swapped()
    await fake.send.send(SEND)
    fake.state.target = NEW_DRIVER_USER_ID

    await fake.send.send({ ...SEND, bodyText: 'Troca de motorista.', idempotencyKey: 'key-0002' })

    expect(fake.state.conversations).toEqual([
      { driverUserId: NEW_DRIVER_USER_ID, id: 'conversation-1' },
    ])
    expect((await fake.list.list(NEW)).map((message) => message.bodyText)).toEqual([
      'Pode aguardar na doca?',
      'Troca de motorista.',
    ])
    expect(await fake.list.list(OLD)).toEqual([])
    expect(fake.state.notifications.at(-1)).toMatchObject({ recipientUserId: NEW_DRIVER_USER_ID })
  })

  test('quem não é o destinatário da conversa não responde nela: 409, nada gravado', async () => {
    const fake = swapped()
    await fake.send.send(SEND)
    const before = fake.state.messages.length

    expect(
      await failure(() =>
        fake.reply.reply({ ...NEW, bodyText: 'Sou o segundo.', idempotencyKey: 'reply-0003' }),
      ),
    ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_DRIVER_CHANGED', status: 409 })
    expect(fake.state.messages).toHaveLength(before)
  })

  test('o novo motorista principal responde antes da operação escrever: a conversa passa a ele', async () => {
    const fake = swapped()
    await fake.send.send(SEND)
    fake.state.target = NEW_DRIVER_USER_ID

    await fake.reply.reply({ ...NEW, bodyText: 'Assumi a viagem.', idempotencyKey: 'reply-0004' })

    expect(fake.state.conversations[0]?.driverUserId).toBe(NEW_DRIVER_USER_ID)
    expect(
      await failure(() =>
        fake.reply.reply({ ...OLD, bodyText: 'Ainda estou aqui.', idempotencyKey: 'reply-0005' }),
      ),
    ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_DRIVER_CHANGED', status: 409 })
  })
})

/**
 * Spec 183 T604 (RF14): o app do motorista confirma a entrega ao **baixar** e a leitura ao **abrir**
 * — pela política, então nada regride e o repetido não muda nada.
 */
describe('entregue ao baixar, lida ao abrir (spec 183 T604)', () => {
  const MINE = {
    companyId: COMPANY_ID,
    driverId: DRIVER_ID,
    driverUserId: DRIVER_USER_ID,
    occurrenceId: OCCURRENCE_ID,
  }

  test('a lista das conversas dele vem com as não lidas e marca entregue o que baixou', async () => {
    const fake = createFake()

    expect(await fake.inbox.list({ companyId: COMPANY_ID, driverUserId: DRIVER_USER_ID })).toEqual([
      {
        lastMessageAt: NOW.toISOString(),
        occurrenceId: OCCURRENCE_ID,
        occurrenceLabel: 'NF 4512/1',
        unreadCount: 1,
      },
    ])
    expect(fake.state.statusCalls).toEqual([
      {
        at: NOW,
        companyId: COMPANY_ID,
        driverUserId: DRIVER_USER_ID,
        incoming: 'delivered',
        occurrenceId: null,
      },
    ])
  })

  test('baixar a conversa de uma ocorrência marca entregue só a dela', async () => {
    const fake = createFake()
    await fake.list.list(MINE)
    expect(fake.state.statusCalls).toEqual([
      {
        at: NOW,
        companyId: COMPANY_ID,
        driverUserId: DRIVER_USER_ID,
        incoming: 'delivered',
        occurrenceId: OCCURRENCE_ID,
      },
    ])
  })

  test('abrir marca lida; ocorrência que não é dele é 404 sem marcar nada', async () => {
    const fake = createFake()
    await fake.markRead.markRead(MINE)
    expect(fake.state.statusCalls).toEqual([
      {
        at: NOW,
        companyId: COMPANY_ID,
        driverUserId: DRIVER_USER_ID,
        incoming: 'read',
        occurrenceId: OCCURRENCE_ID,
      },
    ])

    const other = createFake({ driverOnTrip: false })
    expect(await failure(() => other.markRead.markRead(MINE))).toMatchObject({
      code: 'TRIP_OCCURRENCE_NOT_FOUND',
    })
    expect(other.state.statusCalls).toEqual([])
  })
})
