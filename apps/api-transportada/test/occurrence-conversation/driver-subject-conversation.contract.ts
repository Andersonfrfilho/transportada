/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4: os casos de uso do motorista por assunto, com portas falsas — lista (rótulo, canais,
 * estado efetivo, cursor), abrir (idempotente, só nota e viagem, encerrada recusa), mensagens e leitura.
 * Mais a prova de que a conversa não decide: o código novo não toca tratativa, taxa nem acerto.
 */
import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import type {
  DriverSubjectTransactionPort,
  MyConversationSubject,
  SubjectConversationRow,
  SubjectMessageRecord,
} from '../../src/occurrence-conversation/application/driver-conversation-subject.port.js'
import { createListMySubjectConversationsUseCase } from '../../src/occurrence-conversation/application/list-my-subject-conversations.use-case.js'
import { createListMySubjectMessagesUseCase } from '../../src/occurrence-conversation/application/list-my-subject-messages.use-case.js'
import { createMarkMySubjectReadUseCase } from '../../src/occurrence-conversation/application/mark-my-subject-read.use-case.js'
import { createOpenMySubjectConversationUseCase } from '../../src/occurrence-conversation/application/open-my-subject-conversation.use-case.js'
import { UNUSED_ATTACHMENT_STORAGE } from '../fixtures/conversation-attachment.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000260001'
const DRIVER_ID = '00000000-0000-4000-8000-000000260002'
const DRIVER_USER_ID = '00000000-0000-4000-8000-000000260003'
const OTHER_USER_ID = '00000000-0000-4000-8000-000000260004'
const TRIP_ID = '00000000-0000-4000-8000-000000260005'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000260006'
const CONVERSATION_ID = '00000000-0000-4000-8000-000000260007'
const NOW = new Date('2026-10-09T15:00:00.000Z')

const IDENTITY = { companyId: COMPANY_ID, driverId: DRIVER_ID, driverUserId: DRIVER_USER_ID }

function row(overrides: Partial<SubjectConversationRow> = {}): SubjectConversationRow {
  return {
    channels: ['whatsapp', 'app'],
    conversationId: CONVERSATION_ID,
    documentReleasedAt: null,
    iconName: null,
    labelFacts: { invoiceNumber: '4521', recipientName: 'Casa Verde', subjectType: 'document' },
    lastMessageAt: new Date('2026-10-09T14:00:00.000Z'),
    lastMessageDirection: 'outbound',
    lastMessagePreview: 'Pode aguardar?',
    protocol: '261009-K7M2',
    sortAt: new Date('2026-10-09T14:00:00.000Z'),
    storedStatus: 'open',
    subjectId: DOCUMENT_ID,
    subjectType: 'document',
    tripId: TRIP_ID,
    tripStatus: 'in_transit',
    unreadCount: 2,
    ...overrides,
  }
}

function subject(overrides: Partial<MyConversationSubject> = {}): MyConversationSubject {
  return {
    conversation: null,
    documentReleasedAt: null,
    isPrincipal: true,
    occurrenceKind: null,
    subjectId: DOCUMENT_ID,
    subjectType: 'document',
    tripId: TRIP_ID,
    tripStatus: 'in_transit',
    ...overrides,
  }
}

type Calls = { name: string; input: unknown }[]

function createFake(state: {
  readonly hasMore?: boolean
  readonly messages?: readonly SubjectMessageRecord[]
  readonly officeReadAt?: ReadonlyMap<string, Date>
  readonly officeReadHorizon?: Date | null
  readonly rows?: readonly SubjectConversationRow[]
  readonly subject?: MyConversationSubject | null
}) {
  const calls: Calls = []
  const port: DriverSubjectTransactionPort = {
    applySubjectStatus: async (input) => void calls.push({ input, name: 'applySubjectStatus' }),
    findMySubject: async (input) => {
      calls.push({ input, name: 'findMySubject' })
      return state.subject ?? null
    },
    findOrCreateSubjectConversation: async (input) => {
      calls.push({ input, name: 'findOrCreateSubjectConversation' })
      return { created: true, id: CONVERSATION_ID }
    },
    listAttachments: async () => [],
    listMySubjects: async (input) => {
      calls.push({ input, name: 'listMySubjects' })
      return { hasMore: state.hasMore ?? false, rows: state.rows ?? [row()] }
    },
    listSubjectMessages: async (input) => {
      calls.push({ input, name: 'listSubjectMessages' })
      return state.messages ?? []
    },
    readOfficeReadAtByConversation: async (input) => {
      calls.push({ input, name: 'readOfficeReadAtByConversation' })
      return state.officeReadAt ?? new Map()
    },
    readOfficeReadHorizon: async (input) => {
      calls.push({ input, name: 'readOfficeReadHorizon' })
      return state.officeReadHorizon ?? null
    },
  }
  return {
    calls,
    unitOfWork: { execute: <T>(work: (tx: typeof port) => Promise<T>) => work(port) },
  }
}

const namesOf = (calls: Calls) => calls.map((call) => call.name)

async function failure(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work()
  } catch (error) {
    return error
  }
  return undefined
}

describe('a lista de conversas por assunto (spec 263 T2.4)', () => {
  test('monta o resumo do contrato: protocolo, rótulo, canais em ordem, não lidas e espera', async () => {
    const fake = createFake({})
    const result = await createListMySubjectConversationsUseCase({
      clock: () => NOW,
      unitOfWork: fake.unitOfWork,
    }).list({ ...IDENTITY, cursor: null })

    expect(result.data).toEqual([
      {
        awaitingDriver: true,
        channels: ['app', 'whatsapp'],
        lastMessageAt: '2026-10-09T14:00:00.000Z',
        lastMessageDirection: 'outbound',
        lastMessagePreview: 'Pode aguardar?',
        protocol: '261009-K7M2',
        status: 'open',
        subjectId: DOCUMENT_ID,
        subjectLabel: 'NF 4521 · Casa Verde',
        subjectType: 'document',
        tripId: TRIP_ID,
        unreadCount: 2,
      },
    ])
    expect(result.nextCursor).toBeNull()
  })

  test('officeReadAt: presente só na conversa que o escritório leu; uma consulta em lote para a página', async () => {
    const OTHER_CONVERSATION_ID = '00000000-0000-4000-8000-000000260008'
    const readAt = new Date('2026-10-09T14:30:00.000Z')
    const fake = createFake({
      officeReadAt: new Map([[CONVERSATION_ID, readAt]]),
      rows: [row(), row({ conversationId: OTHER_CONVERSATION_ID })],
    })
    const { data } = await createListMySubjectConversationsUseCase({
      clock: () => NOW,
      unitOfWork: fake.unitOfWork,
    }).list({ ...IDENTITY, cursor: null })
    expect(data[0]).toMatchObject({ officeReadAt: '2026-10-09T14:30:00.000Z' })
    expect(data[1]).not.toHaveProperty('officeReadAt')
    const batchCalls = fake.calls.filter((call) => call.name === 'readOfficeReadAtByConversation')
    expect(batchCalls).toHaveLength(1)
    expect(batchCalls[0]?.input).toEqual({
      companyId: COMPANY_ID,
      conversationIds: [CONVERSATION_ID, OTHER_CONVERSATION_ID],
    })
  })

  test('baixar é entregar, só para as conversas da página', async () => {
    const fake = createFake({})
    await createListMySubjectConversationsUseCase({
      clock: () => NOW,
      unitOfWork: fake.unitOfWork,
    }).list({ ...IDENTITY, cursor: null })
    expect(fake.calls.find((call) => call.name === 'applySubjectStatus')?.input).toEqual({
      at: NOW,
      companyId: COMPANY_ID,
      conversationIds: [CONVERSATION_ID],
      incoming: 'delivered',
    })
  })

  test('encerrada não espera resposta; sem mensagem não há prévia nem direção; ícone só se houver', async () => {
    const fake = createFake({
      rows: [
        row({ documentReleasedAt: NOW }),
        row({
          iconName: 'alert',
          lastMessageAt: null,
          lastMessageDirection: null,
          lastMessagePreview: null,
          unreadCount: 0,
        }),
      ],
    })
    const { data } = await createListMySubjectConversationsUseCase({
      clock: () => NOW,
      unitOfWork: fake.unitOfWork,
    }).list({ ...IDENTITY, cursor: null })

    expect(data[0]).toMatchObject({ awaitingDriver: false, status: 'closed' })
    expect(data[1]).toMatchObject({ awaitingDriver: false, iconName: 'alert', lastMessageAt: null })
    expect(data[1]).not.toHaveProperty('lastMessagePreview')
    expect(data[1]).not.toHaveProperty('lastMessageDirection')
    expect(data[0]).not.toHaveProperty('iconName')
  })

  test('com mais páginas devolve o cursor da última linha; sem mais, nulo', async () => {
    const fake = createFake({ hasMore: true })
    const { nextCursor } = await createListMySubjectConversationsUseCase({
      clock: () => NOW,
      unitOfWork: fake.unitOfWork,
    }).list({ ...IDENTITY, cursor: null })
    expect(nextCursor).toBe(`2026-10-09T14:00:00.000Z::${CONVERSATION_ID}`)

    await createListMySubjectConversationsUseCase({
      clock: () => NOW,
      unitOfWork: fake.unitOfWork,
    }).list({ ...IDENTITY, cursor: nextCursor })
    expect(fake.calls.filter((call) => call.name === 'listMySubjects')[1]?.input).toMatchObject({
      cursor: { createdAt: new Date('2026-10-09T14:00:00.000Z'), id: CONVERSATION_ID },
      limit: 50,
    })
  })
})

describe('abrir a conversa por assunto (spec 263 D4)', () => {
  const open = (
    fake: ReturnType<typeof createFake>,
    subjectType: 'document' | 'trip' = 'document',
  ) =>
    createOpenMySubjectConversationUseCase({ unitOfWork: fake.unitOfWork }).open({
      ...IDENTITY,
      subjectId: DOCUMENT_ID,
      subjectType,
    })

  test('cria (created) e devolve o resumo; o principal retarget', async () => {
    const fake = createFake({ subject: subject() })
    const result = await open(fake)
    expect(result.created).toBe(true)
    expect(result.summary.protocol).toBe('261009-K7M2')
    expect(
      fake.calls.find((call) => call.name === 'findOrCreateSubjectConversation')?.input,
    ).toEqual({
      companyId: COMPANY_ID,
      driverUserId: DRIVER_USER_ID,
      retarget: true,
      subjectId: DOCUMENT_ID,
      subjectType: 'document',
      tripId: TRIP_ID,
    })
  })

  test('o resumo do open também traz o officeReadAt quando o escritório leu', async () => {
    const readAt = new Date('2026-10-09T14:45:00.000Z')
    const read = await open(
      createFake({ officeReadAt: new Map([[CONVERSATION_ID, readAt]]), subject: subject() }),
    )
    expect(read.summary.officeReadAt).toBe('2026-10-09T14:45:00.000Z')
    const unread = await open(createFake({ subject: subject() }))
    expect(unread.summary).not.toHaveProperty('officeReadAt')
  })

  test('ocorrência não se abre pelo motorista: 400 antes de tocar o banco', async () => {
    const fake = createFake({ subject: subject() })
    const error = await failure(() => open(fake, 'occurrence' as never))
    expect(error).toMatchObject({ code: 'INVALID_REQUEST', status: 400 })
    expect(fake.calls).toEqual([])
  })

  test('assunto fora da tripulação ou inexistente é o mesmo 404', async () => {
    const fake = createFake({ subject: null })
    expect(await failure(() => open(fake))).toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
      status: 404,
    })
    expect(namesOf(fake.calls)).toEqual(['findMySubject'])
  })

  test('encerrada (nota liberada, viagem terminal ou gravada) é 409 CONVERSATION_CLOSED', async () => {
    for (const closed of [
      subject({ documentReleasedAt: NOW }),
      subject({ tripStatus: 'cancelled' }),
      subject({
        conversation: { driverUserId: DRIVER_USER_ID, id: CONVERSATION_ID, storedStatus: 'closed' },
      }),
    ]) {
      const fake = createFake({ subject: closed })
      expect(await failure(() => open(fake))).toMatchObject({
        code: 'CONVERSATION_CLOSED',
        status: 409,
      })
      expect(namesOf(fake.calls)).not.toContain('findOrCreateSubjectConversation')
    }
  })

  test('tripulante que não é o destinatário nem o principal: 409 de motorista trocado', async () => {
    const fake = createFake({
      subject: subject({
        conversation: { driverUserId: OTHER_USER_ID, id: CONVERSATION_ID, storedStatus: 'open' },
        isPrincipal: false,
      }),
    })
    expect(await failure(() => open(fake))).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_DRIVER_CHANGED',
    })
  })

  test('o principal assume a conversa que era de outro (retarget), sem escrita na leitura', async () => {
    const fake = createFake({
      subject: subject({
        conversation: { driverUserId: OTHER_USER_ID, id: CONVERSATION_ID, storedStatus: 'open' },
      }),
    })
    await open(fake)
    expect(
      fake.calls.find((call) => call.name === 'findOrCreateSubjectConversation')?.input,
    ).toMatchObject({ retarget: true })
  })
})

describe('as mensagens e a leitura por assunto (spec 263 T2.4)', () => {
  const messages = (
    fake: ReturnType<typeof createFake>,
    extra: { before?: string; limit?: number } = {},
  ) =>
    createListMySubjectMessagesUseCase({
      clock: () => NOW,
      storage: UNUSED_ATTACHMENT_STORAGE,
      unitOfWork: fake.unitOfWork,
    }).list({ ...IDENTITY, ...extra, subjectId: DOCUMENT_ID, subjectType: 'document' })
  const existing = subject({
    conversation: { driverUserId: DRIVER_USER_ID, id: CONVERSATION_ID, storedStatus: 'open' },
  })

  test('sem conversa, assunto da tripulação devolve lista vazia sem escrever', async () => {
    const fake = createFake({ subject: subject() })
    expect(await messages(fake)).toEqual([])
    expect(namesOf(fake.calls)).toEqual(['findMySubject'])
  })

  test('assunto alheio e conversa de outro motorista são o mesmo 404', async () => {
    expect(await failure(() => messages(createFake({ subject: null })))).toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
    })
    const foreign = subject({
      conversation: { driverUserId: OTHER_USER_ID, id: CONVERSATION_ID, storedStatus: 'open' },
      isPrincipal: false,
    })
    expect(await failure(() => messages(createFake({ subject: foreign })))).toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
    })
  })

  test('entrega, lê com o limite padrão e devolve a mensagem com eco e canal', async () => {
    const fake = createFake({
      messages: [
        {
          authorName: 'Operação',
          bodyText: 'Pode aguardar?',
          channel: 'app',
          clientMessageId: null,
          createdAt: new Date('2026-10-09T14:00:00.000Z'),
          direction: 'outbound',
          id: 'm1',
          status: 'queued',
        },
      ],
      subject: existing,
    })
    const result = await messages(fake, { before: 'm9' })
    expect(result).toEqual([
      {
        attachments: [],
        authorName: 'Operação',
        bodyText: 'Pode aguardar?',
        channel: 'app',
        clientMessageId: null,
        createdAt: '2026-10-09T14:00:00.000Z',
        direction: 'outbound',
        id: 'm1',
        status: 'queued',
      },
    ])
    expect(namesOf(fake.calls)).toEqual([
      'findMySubject',
      'applySubjectStatus',
      'listSubjectMessages',
      'readOfficeReadHorizon',
    ])
    expect(fake.calls[2]?.input).toEqual({
      before: 'm9',
      companyId: COMPANY_ID,
      conversationId: CONVERSATION_ID,
      limit: 50,
    })
  })

  test('mensagem do motorista: lida só se o escritório leu até ela; uma consulta de leitura por página', async () => {
    const own = (id: string, createdAt: string): SubjectMessageRecord => ({
      authorName: null,
      bodyText: id,
      channel: 'app',
      clientMessageId: null,
      createdAt: new Date(createdAt),
      direction: 'inbound',
      id,
      status: null,
    })
    const fake = createFake({
      messages: [
        own('m1', '2026-10-09T14:00:00.000Z'),
        own('m2', '2026-10-09T14:05:00.000Z'),
        { ...own('m3', '2026-10-09T14:06:00.000Z'), direction: 'outbound', status: 'queued' },
        own('m4', '2026-10-09T14:10:00.000Z'),
      ],
      officeReadHorizon: new Date('2026-10-09T14:05:00.000Z'),
      subject: existing,
    })
    const result = await messages(fake)
    expect(result.map((message) => message.status)).toEqual(['read', 'read', 'queued', 'delivered'])
    const horizonCalls = fake.calls.filter((call) => call.name === 'readOfficeReadHorizon')
    expect(horizonCalls).toHaveLength(1)
    expect(horizonCalls[0]?.input).toEqual({
      companyId: COMPANY_ID,
      conversationId: CONVERSATION_ID,
      driverUserId: existing.conversation?.driverUserId,
    })
  })

  test('sem leitura do escritório, a mensagem do motorista é entregue (dois ticks cinza)', async () => {
    const fake = createFake({
      messages: [
        {
          authorName: null,
          bodyText: 'Cheguei',
          channel: 'app',
          clientMessageId: 'c1',
          createdAt: new Date('2026-10-09T14:00:00.000Z'),
          direction: 'inbound',
          id: 'm1',
          status: null,
        },
      ],
      subject: existing,
    })
    expect((await messages(fake)).map((message) => message.status)).toEqual(['delivered'])
  })

  test('o limite pedido acima do teto cai em 100', async () => {
    const fake = createFake({ subject: existing })
    await messages(fake, { limit: 5000 })
    expect(fake.calls.find((call) => call.name === 'listSubjectMessages')?.input).toMatchObject({
      limit: 100,
    })
  })

  test('ler marca lida só a conversa do assunto; sem conversa é nada; alheio é 404', async () => {
    const markRead = (fake: ReturnType<typeof createFake>) =>
      createMarkMySubjectReadUseCase({ clock: () => NOW, unitOfWork: fake.unitOfWork }).markRead({
        ...IDENTITY,
        subjectId: DOCUMENT_ID,
        subjectType: 'document',
      })
    const fake = createFake({ subject: existing })
    await markRead(fake)
    expect(fake.calls[1]).toEqual({
      input: {
        at: NOW,
        companyId: COMPANY_ID,
        conversationIds: [CONVERSATION_ID],
        incoming: 'read',
      },
      name: 'applySubjectStatus',
    })
    const empty = createFake({ subject: subject() })
    await markRead(empty)
    expect(namesOf(empty.calls)).toEqual(['findMySubject'])
    expect(await failure(() => markRead(createFake({ subject: null })))).toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
    })
  })

  test('conversa encerrada ainda se lê', async () => {
    const closed = subject({
      conversation: { driverUserId: DRIVER_USER_ID, id: CONVERSATION_ID, storedStatus: 'closed' },
      tripStatus: 'completed',
    })
    expect(await messages(createFake({ subject: closed }))).toEqual([])
  })
})

/** A conversa não decide (D4): o código novo não importa nem cita a tratativa, a cobrança e o acerto. */
const DECISION_WRITERS = [
  'tripOccurrenceCases',
  'tripOccurrenceCaseEvents',
  'tripOccurrenceItemSettlements',
  'deliveryCharges',
  'occurrence-case.use-case',
  'record-occurrence-settlement.use-case',
  'drizzle-occurrence-case.repository',
  'drizzle-delivery-charge.repository',
  'trip_occurrence_cases',
  'delivery_charges',
] as const

function findDecisionWriters(source: string): readonly string[] {
  return DECISION_WRITERS.filter((writer) => source.includes(writer))
}

const SUBJECT_SOURCE_FILES = [
  'application/driver-conversation-subject.port.ts',
  'application/driver-subject-access.service.ts',
  'application/driver-subject-write.port.ts',
  'application/close-trip-subject-conversation.use-case.ts',
  'application/list-office-subject-messages.use-case.ts',
  'application/list-trip-subject-conversations.use-case.ts',
  'application/mark-office-subject-read.use-case.ts',
  'application/office-subject-access.service.ts',
  'application/office-subject-conversation.port.ts',
  'application/office-subject-conversation.types.ts',
  'application/open-trip-subject-conversation.use-case.ts',
  'application/request-office-subject-upload.use-case.ts',
  'application/send-office-subject-message.support.ts',
  'application/send-office-subject-message.use-case.ts',
  'application/driver-subject-conversation.types.ts',
  'application/list-my-subject-conversations.use-case.ts',
  'application/list-my-subject-messages.use-case.ts',
  'application/mark-my-subject-read.use-case.ts',
  'application/open-my-subject-conversation.use-case.ts',
  'application/reply-my-subject-conversation.support.ts',
  'application/reply-my-subject-conversation.use-case.ts',
  'application/request-my-subject-upload.use-case.ts',
  'infrastructure/driver-conversation-subject.query.ts',
  'infrastructure/driver-subject-facts.query.ts',
  'infrastructure/driver-subject-lookup.query.ts',
  'infrastructure/drizzle-driver-conversation-subject.repository.ts',
  'infrastructure/drizzle-driver-subject-write.repository.ts',
  'infrastructure/drizzle-office-subject-conversation.repository.ts',
  'infrastructure/office-subject-list.query.ts',
  'infrastructure/office-subject-lookup.query.ts',
  'infrastructure/office-subject-message.query.ts',
  'infrastructure/office-subject-notifier.adapter.ts',
  'presentation/me-subject-conversation-write.routes.ts',
  'presentation/me-subject-conversation.routes.ts',
  'presentation/office-subject-conversation-write.routes.ts',
  'presentation/office-subject-conversation.routes.ts',
] as const

describe('a conversa por assunto nunca decide (spec 263 D4)', () => {
  const root = new URL('../../src/occurrence-conversation/', import.meta.url)

  test('nenhum arquivo novo toca tratativa, taxa nem acerto', async () => {
    const offenders: string[] = []
    for (const file of SUBJECT_SOURCE_FILES) {
      const source = await readFile(new URL(file, root), 'utf8')
      for (const writer of findDecisionWriters(source)) offenders.push(`${file}: ${writer}`)
    }
    expect(offenders).toEqual([])
  })

  test('mutação: o detector pega o import proibido se ele aparecer', async () => {
    const source = await readFile(
      new URL('application/open-my-subject-conversation.use-case.ts', root),
      'utf8',
    )
    expect(findDecisionWriters(source)).toEqual([])
    const mutated = `${source}\nimport { tripOccurrenceCases } from '../../database/trip.schema.js'\n`
    expect(findDecisionWriters(mutated)).toEqual(['tripOccurrenceCases'])
  })

  test('mutação: o detector pega a tratativa e o acerto nos arquivos de escrita', async () => {
    for (const file of [
      'application/reply-my-subject-conversation.support.ts',
      'application/reply-my-subject-conversation.use-case.ts',
      'presentation/me-subject-conversation-write.routes.ts',
      'application/send-office-subject-message.use-case.ts',
      'presentation/office-subject-conversation-write.routes.ts',
    ]) {
      const source = await readFile(new URL(file, root), 'utf8')
      expect(findDecisionWriters(source)).toEqual([])
      const mutated = `${source}\nimport { recordOccurrenceSettlement } from './record-occurrence-settlement.use-case.js'\n`
      expect(findDecisionWriters(mutated)).toEqual(['record-occurrence-settlement.use-case'])
      expect(findDecisionWriters(`${source}\nconst table = 'delivery_charges'\n`)).toEqual([
        'delivery_charges',
      ])
    }
  })

  test('a lista de arquivos cobre tudo o que é da conversa por assunto', async () => {
    const files = (await readdir(root, { recursive: true })).filter((file) =>
      /(subject-conversation|conversation-subject|driver-subject|my-subject|office-subject|trip-subject)/u.test(
        file,
      ),
    )
    const covered = new Set<string>(SUBJECT_SOURCE_FILES)
    const uncovered = files
      .filter(
        (file) =>
          file.endsWith('.ts') && /^(application|infrastructure|presentation)\//u.test(file),
      )
      .filter((file) => !covered.has(file))
    expect(uncovered).toEqual([])
  })
})
