/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b: os casos de uso do escritório na conversa de nota e de viagem, com portas falsas — a
 * lista, abrir (e reabrir), enviar (retarget, idempotência, encerrada, sem motorista), o pedido de upload,
 * encerrar, marcar como lida e as mensagens. O 404 é um só para tudo que não é da viagem do caminho.
 */
import { describe, expect, test } from 'bun:test'

import { createCloseTripSubjectConversationUseCase } from '../../src/occurrence-conversation/application/close-trip-subject-conversation.use-case.js'
import type { OfficeSubjectInput } from '../../src/occurrence-conversation/application/office-subject-access.service.js'
import { createListOfficeSubjectMessagesUseCase } from '../../src/occurrence-conversation/application/list-office-subject-messages.use-case.js'
import { createListTripSubjectConversationsUseCase } from '../../src/occurrence-conversation/application/list-trip-subject-conversations.use-case.js'
import { createMarkOfficeSubjectReadUseCase } from '../../src/occurrence-conversation/application/mark-office-subject-read.use-case.js'
import type {
  OfficeSubject,
  OfficeSubjectRow,
  OfficeSubjectTransactionPort,
} from '../../src/occurrence-conversation/application/office-subject-conversation.port.js'
import { createOpenTripSubjectConversationUseCase } from '../../src/occurrence-conversation/application/open-trip-subject-conversation.use-case.js'
import { createRequestOfficeSubjectUploadUseCase } from '../../src/occurrence-conversation/application/request-office-subject-upload.use-case.js'
import { createSendOfficeSubjectMessageUseCase } from '../../src/occurrence-conversation/application/send-office-subject-message.use-case.js'
import { SEND_SUBJECT_APP_MESSAGE_OPERATION } from '../../src/occurrence-conversation/domain/office-subject-conversation.constant.js'
import {
  ConversationClosedError,
  ConversationNoDriverError,
  ConversationNotFoundError,
  OccurrenceConversationIdempotencyKeyReusedError,
} from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import {
  listNoAttachments,
  NO_ATTACHMENTS,
  UNUSED_ATTACHMENT_STORAGE,
} from '../fixtures/conversation-attachment.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000260401'
const TRIP_ID = '00000000-0000-4000-8000-000000260402'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000260403'
const CONVERSATION_ID = '00000000-0000-4000-8000-000000260404'
const PRINCIPAL_USER_ID = '00000000-0000-4000-8000-000000260405'
const OLD_DRIVER_USER_ID = '00000000-0000-4000-8000-000000260406'
const OPERATOR_ID = '00000000-0000-4000-8000-000000260407'
const KEY = 'office-send-key-0001'
const NOW = new Date('2026-10-09T15:00:00.000Z')
const NOTE = {
  companyId: COMPANY_ID,
  subjectId: DOCUMENT_ID,
  subjectType: 'document',
  tripId: TRIP_ID,
} as const
const TRIP = {
  companyId: COMPANY_ID,
  subjectId: TRIP_ID,
  subjectType: 'trip',
  tripId: TRIP_ID,
} as const

function officeSubject(overrides: Partial<OfficeSubject> = {}): OfficeSubject {
  return {
    conversation: { driverUserId: OLD_DRIVER_USER_ID, id: CONVERSATION_ID, storedStatus: 'open' },
    documentReleasedAt: null,
    labelFacts: { invoiceNumber: '4521', recipientName: 'Casa Verde', subjectType: 'document' },
    tripStatus: 'in_transit',
    ...overrides,
  }
}

function summaryRow(overrides: Partial<OfficeSubjectRow> = {}): OfficeSubjectRow {
  return {
    channels: ['app'],
    conversationId: CONVERSATION_ID,
    documentReleasedAt: null,
    driverName: 'Joao Silva',
    iconName: null,
    labelFacts: { invoiceNumber: '4521', recipientName: 'Casa Verde', subjectType: 'document' },
    lastMessageAt: NOW,
    lastMessageDirection: 'inbound',
    lastMessagePreview: 'Cheguei',
    protocol: '261009-K7M2',
    sortAt: NOW,
    storedStatus: 'open',
    subjectId: DOCUMENT_ID,
    subjectType: 'document',
    tripId: TRIP_ID,
    tripStatus: 'in_transit',
    unreadCount: 2,
    ...overrides,
  }
}

type Call = { input: unknown; name: string }

function createWorld(
  state: {
    readonly principal?: null | string
    readonly rows?: readonly OfficeSubjectRow[] | null
    readonly subject?: OfficeSubject | null
  } = {},
) {
  const calls: Call[] = []
  const idempotency = new Map<string, { fingerprint: string; response: unknown }>()
  const messages: {
    authorName: null | string
    bodyText: string
    conversationId: string
    createdAt: Date
    direction: 'inbound' | 'outbound'
    id: string
  }[] = []
  const subject = state.subject === undefined ? officeSubject() : state.subject
  const principal = state.principal === undefined ? PRINCIPAL_USER_ID : state.principal
  const record = (name: string, input: unknown) => void calls.push({ input, name })

  const port: OfficeSubjectTransactionPort = {
    attachments: NO_ATTACHMENTS,
    findIdempotency: async (input) =>
      idempotency.get(`${input.operation}:${input.idempotencyKey}`) ?? null,
    findOfficeMessage: async ({ messageId }) => {
      const found = messages.find((message) => message.id === messageId)
      if (found === undefined) return null
      return {
        authorName: found.authorName,
        bodyText: found.bodyText,
        channel: 'app',
        clientMessageId: KEY,
        createdAt: found.createdAt,
        direction: found.direction,
        id: found.id,
        status: 'queued',
      }
    },
    findOfficeSubject: async (input) => {
      record('findOfficeSubject', input)
      return subject
    },
    findOrCreateSubjectConversation: async (input) => {
      record('findOrCreateSubjectConversation', input)
      return { created: subject?.conversation === null, id: CONVERSATION_ID }
    },
    findPrincipalDriverUserId: async () => principal,
    insertMessage: async (input) => {
      record('insertMessage', input)
      const id = `message-${String(messages.length + 1)}`
      messages.push({ ...input, authorName: 'Operadora', id })
      return { id }
    },
    listAttachments: listNoAttachments,
    listOfficeMessages: async (input) => {
      record('listOfficeMessages', input)
      return []
    },
    listTripConversations: async (input) => {
      record('listTripConversations', input)
      return state.rows === null ? null : { rows: state.rows ?? [summaryRow()] }
    },
    markConversationRead: async (input) => record('markConversationRead', input),
    saveIdempotency: async (input) => {
      idempotency.set(`${input.operation}:${input.idempotencyKey}`, {
        fingerprint: input.fingerprint,
        response: input.response,
      })
    },
    setStoredStatus: async (input) => record('setStoredStatus', input),
  }
  const unitOfWork = {
    execute: <T>(work: (transaction: OfficeSubjectTransactionPort) => Promise<T>) => work(port),
  }
  const notices: unknown[] = []
  const fingerprintService = {
    create: async ({ fields, operation }: { fields: readonly Uint8Array[]; operation: string }) =>
      `${operation}|${fields.map((field) => new TextDecoder().decode(field)).join('|')}`,
  }
  return {
    calls,
    idempotency,
    messages,
    notices,
    send: createSendOfficeSubjectMessageUseCase({
      clock: () => NOW,
      fingerprintService,
      notifier: { notify: async (input) => void notices.push(input) },
      storage: UNUSED_ATTACHMENT_STORAGE,
      unitOfWork,
    }),
    unitOfWork,
  }
}

const sendInput = (overrides: Record<string, unknown> = {}) => ({
  ...NOTE,
  actorUserId: OPERATOR_ID,
  bodyText: 'Pode subir agora?',
  idempotencyKey: KEY,
  ...overrides,
})

describe('a lista do escritório (spec 263 T2.4b)', () => {
  test('mapeia o resumo com o nome curto do motorista, não lidas, canais, protocolo e estado efetivo', async () => {
    const world = createWorld({
      rows: [
        summaryRow({ driverName: 'Francisco de Assis Pereira dos Santos Junior' }),
        summaryRow({ documentReleasedAt: NOW, subjectId: 'outra-nota' }),
      ],
    })
    const list = await createListTripSubjectConversationsUseCase(world).list({
      companyId: COMPANY_ID,
      tripId: TRIP_ID,
      userId: OPERATOR_ID,
    })

    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({
      awaitingDriver: false,
      channels: ['app'],
      driverName: 'Francisco de Assis Pereira do…',
      lastMessageAt: NOW.toISOString(),
      lastMessageDirection: 'inbound',
      lastMessagePreview: 'Cheguei',
      protocol: '261009-K7M2',
      status: 'open',
      subjectLabel: 'NF 4521 · Casa Verde',
      subjectType: 'document',
      unreadCount: 2,
    })
    expect(list[1]?.status).toBe('closed')
    expect(world.calls).toEqual([
      {
        input: { companyId: COMPANY_ID, tripId: TRIP_ID, userId: OPERATOR_ID },
        name: 'listTripConversations',
      },
    ])
  })

  test('viagem de outra empresa é 404, o mesmo da inexistente', async () => {
    const world = createWorld({ rows: null })
    await expect(
      createListTripSubjectConversationsUseCase(world).list({
        companyId: COMPANY_ID,
        tripId: TRIP_ID,
        userId: OPERATOR_ID,
      }),
    ).rejects.toBeInstanceOf(ConversationNotFoundError)
  })
})

describe('abrir e reabrir (spec 263 T2.4b)', () => {
  const open = (world: ReturnType<typeof createWorld>, input: OfficeSubjectInput = NOTE) =>
    createOpenTripSubjectConversationUseCase(world).open({ ...input, userId: OPERATOR_ID })

  test('abre com o motorista principal de agora, retarget, e devolve o resumo', async () => {
    const world = createWorld({ subject: officeSubject({ conversation: null }) })
    const opened = await open(world)

    expect(opened.created).toBe(true)
    expect(opened.summary.protocol).toBe('261009-K7M2')
    expect(world.calls.find((call) => call.name === 'findOrCreateSubjectConversation')).toEqual({
      input: {
        companyId: COMPANY_ID,
        driverUserId: PRINCIPAL_USER_ID,
        retarget: true,
        subjectId: DOCUMENT_ID,
        subjectType: 'document',
        tripId: TRIP_ID,
      },
      name: 'findOrCreateSubjectConversation',
    })
    expect(world.calls.some((call) => call.name === 'setStoredStatus')).toBe(false)
  })

  test('a segunda abertura devolve a mesma conversa (created false)', async () => {
    const opened = await open(createWorld())
    expect(opened.created).toBe(false)
  })

  test('a conversa encerrada pelo escritório reabre', async () => {
    const world = createWorld({
      subject: officeSubject({
        conversation: {
          driverUserId: OLD_DRIVER_USER_ID,
          id: CONVERSATION_ID,
          storedStatus: 'closed',
        },
      }),
    })
    await open(world)
    expect(world.calls.find((call) => call.name === 'setStoredStatus')).toEqual({
      input: { companyId: COMPANY_ID, conversationId: CONVERSATION_ID, status: 'open' },
      name: 'setStoredStatus',
    })
  })

  test('nota liberada e viagem terminal não abrem, nem reabrem: 409 sem escrever', async () => {
    for (const subject of [
      officeSubject({ documentReleasedAt: NOW }),
      officeSubject({ tripStatus: 'cancelled' }),
      officeSubject({
        conversation: {
          driverUserId: OLD_DRIVER_USER_ID,
          id: CONVERSATION_ID,
          storedStatus: 'closed',
        },
        tripStatus: 'completed',
      }),
    ]) {
      const world = createWorld({ subject })
      await expect(open(world)).rejects.toBeInstanceOf(ConversationClosedError)
      expect(world.calls.map((call) => call.name)).toEqual(['findOfficeSubject'])
    }
  })

  test('viagem sem motorista principal é 409 CONVERSATION_NO_DRIVER', async () => {
    const world = createWorld({ principal: null })
    const error = await open(world).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ConversationNoDriverError)
    expect(error).toMatchObject({ code: 'CONVERSATION_NO_DRIVER', status: 409 })
  })

  test('assunto que não é da viagem do caminho é 404, e a viagem só abre a si mesma', async () => {
    await expect(open(createWorld({ subject: null }))).rejects.toBeInstanceOf(
      ConversationNotFoundError,
    )
    await expect(open(createWorld(), TRIP)).resolves.toMatchObject({ created: false })
  })
})

describe('enviar ao motorista (spec 263 T2.4b)', () => {
  test('grava a mensagem do app ao principal de agora (retarget), com o autor e a chave, e avisa uma vez', async () => {
    const world = createWorld()
    const result = await world.send.send(sendInput())

    expect(result.replayed).toBe(false)
    expect(result.message).toMatchObject({
      authorName: 'Operadora',
      bodyText: 'Pode subir agora?',
      channel: 'app',
      clientMessageId: KEY,
      direction: 'outbound',
    })
    expect(
      world.calls.find((call) => call.name === 'findOrCreateSubjectConversation')?.input,
    ).toMatchObject({
      driverUserId: PRINCIPAL_USER_ID,
      retarget: true,
    })
    expect(world.calls.find((call) => call.name === 'insertMessage')?.input).toMatchObject({
      authorUserId: OPERATOR_ID,
      conversationId: CONVERSATION_ID,
      direction: 'outbound',
      driverUserId: null,
      idempotencyKey: KEY,
      status: 'queued',
    })
    expect(world.notices).toEqual([
      {
        companyId: COMPANY_ID,
        dedupeKey: result.message.id,
        protocol: '261009-K7M2',
        recipientUserId: PRINCIPAL_USER_ID,
        subjectId: DOCUMENT_ID,
        subjectLabel: 'NF 4521',
        subjectType: 'document',
      },
    ])
    expect(JSON.stringify(world.notices)).not.toContain('Pode subir')
    expect(JSON.stringify(world.notices)).not.toContain('Casa Verde')
  })

  test('usa a operação nova de idempotência e a impressão digital leva o autor, o assunto e o corpo', async () => {
    const world = createWorld()
    await world.send.send(sendInput())
    expect(SEND_SUBJECT_APP_MESSAGE_OPERATION).toBe('conversation.app.send')
    expect([...world.idempotency.entries()]).toEqual([
      [
        `conversation.app.send:${KEY}`,
        {
          fingerprint: `conversation.app.send|${COMPANY_ID}|${OPERATOR_ID}|document|${DOCUMENT_ID}|Pode subir agora?|`,
          response: { conversationId: CONVERSATION_ID, messageId: 'message-1' },
        },
      ],
    ])
  })

  test('a repetição da chave devolve a mesma mensagem, sem gravar nem avisar de novo', async () => {
    const world = createWorld()
    const first = await world.send.send(sendInput())
    const again = await world.send.send(sendInput())

    expect(again.replayed).toBe(true)
    expect(again.message).toEqual(first.message)
    expect(world.messages).toHaveLength(1)
    expect(world.notices).toHaveLength(1)
  })

  test('a mesma chave com outro corpo, ou de outro operador, é 409 e não grava', async () => {
    const world = createWorld()
    await world.send.send(sendInput())
    for (const other of [{ bodyText: 'Outra coisa' }, { actorUserId: PRINCIPAL_USER_ID }]) {
      await expect(world.send.send(sendInput(other))).rejects.toBeInstanceOf(
        OccurrenceConversationIdempotencyKeyReusedError,
      )
    }
    expect(world.messages).toHaveLength(1)
  })

  test('a repetição responde mesmo depois de a conversa encerrar; o envio novo é 409', async () => {
    const world = createWorld()
    await world.send.send(sendInput())
    const closed = createWorld({ subject: officeSubject({ tripStatus: 'completed' }) })
    closed.idempotency.set(...world.idempotency.entries().next().value!)
    closed.messages.push(...world.messages)

    await expect(closed.send.send(sendInput())).resolves.toMatchObject({ replayed: true })
    await expect(
      closed.send.send(sendInput({ idempotencyKey: 'office-send-key-0002' })),
    ).rejects.toBeInstanceOf(ConversationClosedError)
    expect(closed.messages).toHaveLength(1)
  })

  test('encerrada (gravada ou derivada), sem motorista e fora da viagem: 409, 409 e 404, sem gravar', async () => {
    const cases = [
      {
        error: ConversationClosedError,
        world: createWorld({ subject: officeSubject({ documentReleasedAt: NOW }) }),
      },
      {
        error: ConversationClosedError,
        world: createWorld({
          subject: officeSubject({
            conversation: {
              driverUserId: OLD_DRIVER_USER_ID,
              id: CONVERSATION_ID,
              storedStatus: 'closed',
            },
          }),
        }),
      },
      { error: ConversationNoDriverError, world: createWorld({ principal: null }) },
      { error: ConversationNotFoundError, world: createWorld({ subject: null }) },
    ]
    for (const item of cases) {
      await expect(item.world.send.send(sendInput())).rejects.toBeInstanceOf(item.error)
      expect(item.world.messages).toEqual([])
      expect(item.world.notices).toEqual([])
    }
  })

  test('falha do aviso não desfaz a mensagem', async () => {
    const world = createWorld()
    const send = createSendOfficeSubjectMessageUseCase({
      clock: () => NOW,
      fingerprintService: { create: async ({ operation }) => operation },
      notifier: {
        notify: async () => {
          throw new Error('fila fora do ar')
        },
      },
      storage: UNUSED_ATTACHMENT_STORAGE,
      unitOfWork: world.unitOfWork,
    })
    await expect(send.send(sendInput())).resolves.toMatchObject({ replayed: false })
    expect(world.messages).toHaveLength(1)
  })

  test('sem corpo nem anexo a mensagem é recusada antes de abrir transação', async () => {
    const world = createWorld()
    await expect(world.send.send(sendInput({ bodyText: '   ' }))).rejects.toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_MESSAGE_INVALID',
    })
    expect(world.calls).toEqual([])
  })
})

describe('pedir a subida do anexo (spec 263 T2.4b)', () => {
  function createUploadFixture(subject: OfficeSubject | null) {
    const inserted: unknown[] = []
    const world = createWorld({ subject })
    const useCase = createRequestOfficeSubjectUploadUseCase({
      bucket: 'bucket-test',
      clock: () => NOW,
      newId: () => '00000000-0000-4000-8000-000000260498',
      repository: { insertUpload: async (input) => void inserted.push(input) },
      storage: {
        ...UNUSED_ATTACHMENT_STORAGE,
        createSignedUpload: async () => new URL('https://object-storage.test/bucket-test/key'),
      },
      unitOfWork: world.unitOfWork,
    })
    const request = () =>
      useCase.request({
        ...NOTE,
        actorUserId: OPERATOR_ID,
        contentType: 'image/jpeg',
        fileName: 'foto.jpg',
        sizeBytes: 1000,
      })
    return { inserted, request }
  }

  test('aponta a conversa pelo conversation_id, no canal app, para o operador que pediu', async () => {
    const fixture = createUploadFixture(officeSubject())
    const result = await fixture.request()
    expect(Object.keys(result).sort()).toEqual(['expiresAt', 'uploadId', 'uploadUrl'])
    expect(fixture.inserted).toMatchObject([
      {
        channel: 'app',
        companyId: COMPANY_ID,
        conversationId: CONVERSATION_ID,
        participant: 'driver',
        requestedByUserId: OPERATOR_ID,
      },
    ])
  })

  test('sem conversa, encerrada ou fora da viagem não sobe arquivo', async () => {
    const cases = [
      { error: ConversationNotFoundError, subject: officeSubject({ conversation: null }) },
      { error: ConversationClosedError, subject: officeSubject({ documentReleasedAt: NOW }) },
      { error: ConversationNotFoundError, subject: null },
    ]
    for (const item of cases) {
      const fixture = createUploadFixture(item.subject)
      await expect(fixture.request()).rejects.toBeInstanceOf(item.error)
      expect(fixture.inserted).toEqual([])
    }
  })
})

describe('encerrar (spec 263 T2.4b)', () => {
  const close = (world: ReturnType<typeof createWorld>) =>
    createCloseTripSubjectConversationUseCase(world).close({ ...NOTE, userId: OPERATOR_ID })

  test('grava closed e devolve o resumo; encerrar a encerrada não grava de novo', async () => {
    const world = createWorld()
    await close(world)
    expect(world.calls.filter((call) => call.name === 'setStoredStatus')).toEqual([
      {
        input: { companyId: COMPANY_ID, conversationId: CONVERSATION_ID, status: 'closed' },
        name: 'setStoredStatus',
      },
    ])

    const already = createWorld({
      subject: officeSubject({
        conversation: {
          driverUserId: OLD_DRIVER_USER_ID,
          id: CONVERSATION_ID,
          storedStatus: 'closed',
        },
      }),
    })
    await expect(close(already)).resolves.toMatchObject({ protocol: '261009-K7M2' })
    expect(already.calls.some((call) => call.name === 'setStoredStatus')).toBe(false)
  })

  test('sem conversa ou fora da viagem é 404', async () => {
    for (const subject of [officeSubject({ conversation: null }), null]) {
      await expect(close(createWorld({ subject }))).rejects.toBeInstanceOf(
        ConversationNotFoundError,
      )
    }
  })
})

describe('marcar como lida e listar mensagens (spec 263 T2.4b)', () => {
  test('marca lida a conversa do usuário do escritório; sem conversa é no-op; fora da viagem é 404', async () => {
    const world = createWorld()
    await createMarkOfficeSubjectReadUseCase(world).markRead({ ...NOTE, userId: OPERATOR_ID })
    expect(world.calls.filter((call) => call.name === 'markConversationRead')).toEqual([
      {
        input: { companyId: COMPANY_ID, conversationId: CONVERSATION_ID, userId: OPERATOR_ID },
        name: 'markConversationRead',
      },
    ])

    const empty = createWorld({ subject: officeSubject({ conversation: null }) })
    await createMarkOfficeSubjectReadUseCase(empty).markRead({ ...NOTE, userId: OPERATOR_ID })
    expect(empty.calls.some((call) => call.name === 'markConversationRead')).toBe(false)

    await expect(
      createMarkOfficeSubjectReadUseCase(createWorld({ subject: null })).markRead({
        ...NOTE,
        userId: OPERATOR_ID,
      }),
    ).rejects.toBeInstanceOf(ConversationNotFoundError)
  })

  test('mensagens: lista vazia sem conversa, teto de 100 por página e 404 fora da viagem', async () => {
    const empty = createWorld({ subject: officeSubject({ conversation: null }) })
    const messages = (world: ReturnType<typeof createWorld>, limit?: number) =>
      createListOfficeSubjectMessagesUseCase({
        storage: UNUSED_ATTACHMENT_STORAGE,
        unitOfWork: world.unitOfWork,
      }).list({
        ...NOTE,
        ...(limit === undefined ? {} : { limit }),
      })
    await expect(messages(empty)).resolves.toEqual([])

    const world = createWorld()
    await messages(world, 5000)
    expect(world.calls.find((call) => call.name === 'listOfficeMessages')?.input).toMatchObject({
      before: null,
      conversationId: CONVERSATION_ID,
      limit: 100,
    })
    await expect(messages(createWorld({ subject: null }))).rejects.toBeInstanceOf(
      ConversationNotFoundError,
    )
  })
})
