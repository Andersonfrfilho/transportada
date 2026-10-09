/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4: os casos de uso de escrita do motorista por assunto, com portas falsas — a resposta
 * (idempotência 201/200 com o mesmo objeto, chave reutilizada, encerrada, BOLA, retarget, ocorrência pela
 * operação antiga) e o pedido de upload por `conversation_id`.
 */
import { describe, expect, test } from 'bun:test'

import type { DriverConversationTransactionPort } from '../../src/occurrence-conversation/application/driver-conversation.port.js'
import type {
  MyConversationSubject,
  SubjectMessageRecord,
} from '../../src/occurrence-conversation/application/driver-conversation-subject.port.js'
import {
  createReplyMyOccurrenceConversationUseCase,
  REPLY_DRIVER_APP_MESSAGE_OPERATION,
} from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import type { DriverSubjectWriteTransactionPort } from '../../src/occurrence-conversation/application/driver-subject-write.port.js'
import { createReplyMySubjectConversationUseCase } from '../../src/occurrence-conversation/application/reply-my-subject-conversation.use-case.js'
import { createRequestMySubjectUploadUseCase } from '../../src/occurrence-conversation/application/request-my-subject-upload.use-case.js'
import { REPLY_SUBJECT_APP_MESSAGE_OPERATION } from '../../src/occurrence-conversation/domain/driver-subject-conversation.constant.js'
import {
  listNoAttachments,
  NO_ATTACHMENTS,
  UNUSED_ATTACHMENT_STORAGE,
} from '../fixtures/conversation-attachment.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000260201'
const DRIVER_ID = '00000000-0000-4000-8000-000000260202'
const DRIVER_USER_ID = '00000000-0000-4000-8000-000000260203'
const OTHER_USER_ID = '00000000-0000-4000-8000-000000260204'
const TRIP_ID = '00000000-0000-4000-8000-000000260205'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000260206'
const CONVERSATION_ID = '00000000-0000-4000-8000-000000260207'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000260208'
const KEY = 'offline-queue-key-0001'
const NOW = new Date('2026-10-09T15:00:00.000Z')
const IDENTITY = { companyId: COMPANY_ID, driverId: DRIVER_ID, driverUserId: DRIVER_USER_ID }

function subject(overrides: Partial<MyConversationSubject> = {}): MyConversationSubject {
  return {
    conversation: { driverUserId: DRIVER_USER_ID, id: CONVERSATION_ID, storedStatus: 'open' },
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

const occurrenceSubject = (overrides: Partial<MyConversationSubject> = {}) =>
  subject({
    occurrenceKind: 'document',
    subjectId: OCCURRENCE_ID,
    subjectType: 'occurrence',
    ...overrides,
  })

type Call = { input: unknown; name: string }

/** O mundo compartilhado pelas duas rotas: a mesma idempotência e as mesmas mensagens, como no banco. */
function createWorld(state: {
  readonly conversationDriverUserId?: string
  readonly subject?: MyConversationSubject | null
}) {
  const calls: Call[] = []
  const idempotency = new Map<string, { fingerprint: string; response: unknown }>()
  const messages: (SubjectMessageRecord & { conversationId: string })[] = []
  const uploadTargets: unknown[] = []
  const fingerprintFields: string[][] = []
  let current = state.subject === undefined ? subject() : state.subject

  const shared = {
    async findIdempotency(input: { idempotencyKey: string; operation: string }) {
      calls.push({ input, name: 'findIdempotency' })
      return idempotency.get(`${input.operation}:${input.idempotencyKey}`) ?? null
    },
    async saveIdempotency(input: {
      fingerprint: string
      idempotencyKey: string
      operation: string
      response: unknown
    }) {
      idempotency.set(`${input.operation}:${input.idempotencyKey}`, {
        fingerprint: input.fingerprint,
        response: input.response,
      })
    },
    async insertMessage(input: {
      bodyText: string
      conversationId: string
      createdAt: Date
      direction: 'inbound' | 'outbound'
      idempotencyKey: string
    }) {
      calls.push({ input, name: 'insertMessage' })
      const id = `message-${String(messages.length + 1)}`
      messages.push({
        authorName: null,
        bodyText: input.bodyText,
        channel: 'app',
        clientMessageId: input.idempotencyKey,
        conversationId: input.conversationId,
        createdAt: input.createdAt,
        direction: input.direction,
        id,
        status: null,
      })
      return { id }
    },
    async findOrCreateDriverConversation(input: { driverUserId: string; retarget: boolean }) {
      calls.push({ input, name: 'findOrCreateDriverConversation' })
      const owner = state.conversationDriverUserId ?? input.driverUserId
      return {
        driverUserId: input.retarget ? input.driverUserId : owner,
        id: CONVERSATION_ID,
        protocol: '261009-AB12',
      }
    },
  }

  const attachments = {
    attachUpload: async () => undefined,
    lockPendingUploads: async (input: { target: unknown }) => {
      uploadTargets.push(input.target)
      return []
    },
  }

  const writePort: DriverSubjectWriteTransactionPort = {
    ...shared,
    applySubjectStatus: async () => undefined,
    attachments,
    findMySubject: async (input) => {
      calls.push({ input, name: 'findMySubject' })
      return current
    },
    findOrCreateSubjectConversation: async (input) => {
      calls.push({ input, name: 'findOrCreateSubjectConversation' })
      return { created: false, id: CONVERSATION_ID }
    },
    findSubjectMessage: async ({ messageId }) => {
      const found = messages.find((message) => message.id === messageId)
      if (found === undefined) return null
      return {
        authorName: found.authorName,
        bodyText: found.bodyText,
        channel: found.channel,
        clientMessageId: found.clientMessageId,
        createdAt: found.createdAt,
        direction: found.direction,
        id: found.id,
        status: found.status,
      }
    },
    listAttachments: listNoAttachments,
    listMySubjects: async () => ({ hasMore: false, rows: [] }),
    listSubjectMessages: async () => [],
  }

  const oldPort: DriverConversationTransactionPort = {
    ...shared,
    applyDriverStatus: async () => undefined,
    attachments: NO_ATTACHMENTS,
    findDriverTarget: async () => ({
      driverUserId: DRIVER_USER_ID,
      occurrenceKind: 'document',
      occurrenceLabel: 'NF 1',
    }),
    findMyOccurrence: async () => ({ occurrenceKind: 'document' }),
    listAttachments: listNoAttachments,
    listDriverMessages: async () => [],
    listMyConversations: async () => [],
  }

  const fingerprintService = {
    create: async ({ fields, operation }: { fields: readonly Uint8Array[]; operation: string }) => {
      const decoded = fields.map((field) => new TextDecoder().decode(field))
      fingerprintFields.push(decoded)
      return `${operation}|${decoded.join('|')}`
    },
  }
  const dependencies = { clock: () => NOW, fingerprintService, storage: UNUSED_ATTACHMENT_STORAGE }
  return {
    calls,
    fingerprintFields,
    idempotency,
    messages,
    oldReply: createReplyMyOccurrenceConversationUseCase({
      ...dependencies,
      unitOfWork: { execute: (work) => work(oldPort) },
    }),
    reply: createReplyMySubjectConversationUseCase({
      ...dependencies,
      unitOfWork: { execute: (work) => work(writePort) },
    }),
    setSubject(next: MyConversationSubject | null) {
      current = next
    },
    uploadTargets,
    writePort,
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

const namesOf = (calls: readonly Call[]) => calls.map((call) => call.name)
const replyDocument = (
  world: ReturnType<typeof createWorld>,
  extra: { attachmentIds?: readonly string[]; bodyText?: string; idempotencyKey?: string } = {},
) =>
  world.reply.reply({
    ...IDENTITY,
    bodyText: 'Cheguei na doca',
    idempotencyKey: KEY,
    subjectId: DOCUMENT_ID,
    subjectType: 'document',
    ...extra,
  })

describe('a resposta do motorista por assunto (spec 260 T2.4)', () => {
  test('nota: grava inbound pelo app com o eco da chave; a repetição devolve o mesmo objeto sem gravar', async () => {
    const world = createWorld({})
    const first = await replyDocument(world)
    expect(first.replayed).toBe(false)
    expect(first.message).toEqual({
      attachments: [],
      authorName: null,
      bodyText: 'Cheguei na doca',
      channel: 'app',
      clientMessageId: KEY,
      createdAt: '2026-10-09T15:00:00.000Z',
      direction: 'inbound',
      id: 'message-1',
      status: null,
    })
    const inserted = world.calls.find((call) => call.name === 'insertMessage')?.input
    expect(inserted).toMatchObject({ direction: 'inbound', idempotencyKey: KEY })

    const again = await replyDocument(world)
    expect(again).toEqual({ message: first.message, replayed: true })
    expect(world.messages).toHaveLength(1)
    expect(
      world.idempotency.get(`${REPLY_SUBJECT_APP_MESSAGE_OPERATION}:${KEY}`)?.response,
    ).toEqual({
      conversationId: CONVERSATION_ID,
      messageId: 'message-1',
    })
  })

  test('viagem usa a operação nova e a impressão digital leva o tipo do assunto', async () => {
    const world = createWorld({ subject: subject({ subjectId: TRIP_ID, subjectType: 'trip' }) })
    await world.reply.reply({
      ...IDENTITY,
      bodyText: 'Atraso na estrada',
      idempotencyKey: KEY,
      subjectId: TRIP_ID,
      subjectType: 'trip',
    })
    expect(REPLY_SUBJECT_APP_MESSAGE_OPERATION).toBe('conversation.app.reply')
    expect([...world.idempotency.keys()]).toEqual([`conversation.app.reply:${KEY}`])
    expect(world.fingerprintFields[0]).toEqual([
      COMPANY_ID,
      'trip',
      TRIP_ID,
      DRIVER_USER_ID,
      'Atraso na estrada',
      '',
    ])
  })

  test('a mesma chave com outro corpo é 409 e nada é gravado de novo', async () => {
    const world = createWorld({})
    await replyDocument(world)
    expect(await failure(() => replyDocument(world, { bodyText: 'Outro texto' }))).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED',
      status: 409,
    })
    expect(world.messages).toHaveLength(1)
  })

  test('a mesma chave em outra nota também é 409: o assunto entra na impressão digital', async () => {
    const world = createWorld({})
    await replyDocument(world)
    world.setSubject(subject({ subjectId: TRIP_ID, subjectType: 'trip' }))
    expect(
      await failure(() =>
        world.reply.reply({
          ...IDENTITY,
          bodyText: 'Cheguei na doca',
          idempotencyKey: KEY,
          subjectId: TRIP_ID,
          subjectType: 'trip',
        }),
      ),
    ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED' })
  })

  test('encerrada (nota liberada, viagem terminal, encerrada pelo escritório) é 409 e não grava', async () => {
    const closed = [
      subject({ documentReleasedAt: NOW }),
      subject({ tripStatus: 'completed' }),
      subject({ tripStatus: 'cancelled' }),
      subject({
        conversation: { driverUserId: DRIVER_USER_ID, id: CONVERSATION_ID, storedStatus: 'closed' },
      }),
    ]
    for (const closedSubject of closed) {
      const world = createWorld({ subject: closedSubject })
      expect(await failure(() => replyDocument(world))).toMatchObject({
        code: 'CONVERSATION_CLOSED',
        status: 409,
      })
      expect(world.messages).toEqual([])
    }
  })

  test('a repetição de uma mensagem enviada antes de encerrar devolve a mesma, sem 409', async () => {
    const world = createWorld({})
    const first = await replyDocument(world)
    world.setSubject(subject({ documentReleasedAt: NOW }))
    expect(await replyDocument(world)).toEqual({ message: first.message, replayed: true })
  })

  test('BOLA: assunto fora da tripulação ou da empresa é CONVERSATION_NOT_FOUND, sem tocar na idempotência', async () => {
    const world = createWorld({ subject: null })
    expect(await failure(() => replyDocument(world))).toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
      status: 404,
    })
    expect(namesOf(world.calls)).toEqual(['findMySubject'])
  })

  test('retarget: o principal assume a conversa que era de outro', async () => {
    const world = createWorld({
      subject: subject({
        conversation: { driverUserId: OTHER_USER_ID, id: CONVERSATION_ID, storedStatus: 'open' },
      }),
    })
    await replyDocument(world)
    expect(
      world.calls.find((call) => call.name === 'findOrCreateSubjectConversation')?.input,
    ).toMatchObject({ retarget: true, subjectType: 'document', tripId: TRIP_ID })
  })

  test('tripulante que não é o destinatário nem o principal: DRIVER_CHANGED; o destinatário não-principal responde', async () => {
    const foreign = createWorld({
      subject: subject({
        conversation: { driverUserId: OTHER_USER_ID, id: CONVERSATION_ID, storedStatus: 'open' },
        isPrincipal: false,
      }),
    })
    expect(await failure(() => replyDocument(foreign))).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_DRIVER_CHANGED',
      status: 409,
    })
    expect(foreign.messages).toEqual([])

    const own = createWorld({ subject: subject({ isPrincipal: false }) })
    await replyDocument(own)
    expect(
      own.calls.find((call) => call.name === 'findOrCreateSubjectConversation')?.input,
    ).toMatchObject({ retarget: false })
  })

  test('corpo em branco sem anexo é 422 antes de qualquer porta', async () => {
    const world = createWorld({})
    expect(await failure(() => replyDocument(world, { bodyText: '   ' }))).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_MESSAGE_INVALID',
    })
    expect(world.calls).toEqual([])
  })

  test('anexo de nota é buscado pelo conversation_id; o de ocorrência, pelo alvo antigo', async () => {
    const document = createWorld({})
    const rejected = await failure(() =>
      replyDocument(document, { attachmentIds: ['00000000-0000-4000-8000-000000260299'] }),
    )
    expect(rejected).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_UPLOAD_INVALID' })
    expect(document.uploadTargets).toEqual([
      {
        channel: 'app',
        companyId: COMPANY_ID,
        conversationId: CONVERSATION_ID,
        participant: 'driver',
        requestedByUserId: DRIVER_USER_ID,
      },
    ])

    const occurrence = createWorld({ subject: occurrenceSubject() })
    await failure(() =>
      occurrence.reply.reply({
        ...IDENTITY,
        attachmentIds: ['00000000-0000-4000-8000-000000260299'],
        bodyText: '',
        idempotencyKey: KEY,
        subjectId: OCCURRENCE_ID,
        subjectType: 'occurrence',
      }),
    )
    expect(occurrence.uploadTargets).toEqual([
      {
        channel: 'app',
        companyId: COMPANY_ID,
        occurrenceId: OCCURRENCE_ID,
        occurrenceKind: 'document',
        participant: 'driver',
        requestedByUserId: DRIVER_USER_ID,
      },
    ])
  })
})

describe('a ocorrência pela rota nova usa a idempotência da antiga (spec 260 T2.4, ADR-0101 §7)', () => {
  const replyOccurrence = (world: ReturnType<typeof createWorld>, bodyText = 'Foto enviada') =>
    world.reply.reply({
      ...IDENTITY,
      bodyText,
      idempotencyKey: KEY,
      subjectId: OCCURRENCE_ID,
      subjectType: 'occurrence',
    })

  test('a operação é a string da rota antiga, e os campos da impressão digital são os mesmos', async () => {
    const world = createWorld({ subject: occurrenceSubject() })
    await replyOccurrence(world)
    expect(REPLY_DRIVER_APP_MESSAGE_OPERATION).toBe('occurrence-conversation.app.reply')
    expect([...world.idempotency.keys()]).toEqual([`${REPLY_DRIVER_APP_MESSAGE_OPERATION}:${KEY}`])
    expect(world.fingerprintFields[0]).toEqual([
      COMPANY_ID,
      OCCURRENCE_ID,
      DRIVER_USER_ID,
      'Foto enviada',
      '',
    ])
    expect(namesOf(world.calls)).not.toContain('findOrCreateSubjectConversation')
  })

  test('enviada pela rota antiga e reenviada pela nova: devolvida como já enviada, sem duplicar', async () => {
    const world = createWorld({ subject: occurrenceSubject() })
    const old = await world.oldReply.reply({
      ...IDENTITY,
      bodyText: 'Foto enviada',
      idempotencyKey: KEY,
      occurrenceId: OCCURRENCE_ID,
    })
    const replayed = await replyOccurrence(world)
    expect(replayed.replayed).toBe(true)
    expect(replayed.message).toMatchObject({ clientMessageId: KEY, id: old.messageId })
    expect(world.messages).toHaveLength(1)
    expect(await failure(() => replyOccurrence(world, 'Outro corpo'))).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED',
    })
  })

  test('o principal assume (retarget); outro tripulante com a conversa alheia recebe DRIVER_CHANGED', async () => {
    const principal = createWorld({ subject: occurrenceSubject() })
    await replyOccurrence(principal)
    expect(
      principal.calls.find((call) => call.name === 'findOrCreateDriverConversation')?.input,
    ).toMatchObject({ occurrenceId: OCCURRENCE_ID, occurrenceKind: 'document', retarget: true })

    const other = createWorld({
      conversationDriverUserId: OTHER_USER_ID,
      subject: occurrenceSubject({ isPrincipal: false }),
    })
    expect(await failure(() => replyOccurrence(other))).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_DRIVER_CHANGED',
    })
    expect(other.messages).toEqual([])
  })

  test('ocorrência inalcançável é o mesmo CONVERSATION_NOT_FOUND das notas', async () => {
    const world = createWorld({ subject: null })
    expect(await failure(() => replyOccurrence(world))).toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
    })
  })
})

describe('o pedido de upload por assunto (spec 260 T2.4)', () => {
  function createUploadFixture(current: MyConversationSubject | null) {
    const inserted: unknown[] = []
    const useCase = createRequestMySubjectUploadUseCase({
      bucket: 'bucket-test',
      clock: () => NOW,
      newId: () => '00000000-0000-4000-8000-000000260298',
      repository: { insertUpload: async (input) => void inserted.push(input) },
      storage: {
        ...UNUSED_ATTACHMENT_STORAGE,
        createSignedUpload: async () => new URL('https://object-storage.test/bucket-test/key'),
      },
      unitOfWork: {
        execute: (work) =>
          work({
            applySubjectStatus: async () => undefined,
            findMySubject: async () => current,
            findOrCreateSubjectConversation: async () => ({ created: false, id: CONVERSATION_ID }),
            listAttachments: listNoAttachments,
            listMySubjects: async () => ({ hasMore: false, rows: [] }),
            listSubjectMessages: async () => [],
          }),
      },
    })
    const request = (subjectType: 'document' | 'occurrence' | 'trip', subjectId: string) =>
      useCase.request({
        ...IDENTITY,
        contentType: 'image/jpeg',
        fileName: 'foto.jpg',
        sizeBytes: 1000,
        subjectId,
        subjectType,
      })
    return { inserted, request }
  }

  test('nota e viagem: o pedido aponta a conversa; a forma da resposta é a de hoje', async () => {
    const fixture = createUploadFixture(subject())
    const result = await fixture.request('document', DOCUMENT_ID)
    expect(Object.keys(result).sort()).toEqual(['expiresAt', 'uploadId', 'uploadUrl'])
    expect(fixture.inserted).toMatchObject([
      {
        channel: 'app',
        companyId: COMPANY_ID,
        conversationId: CONVERSATION_ID,
        participant: 'driver',
        requestedByUserId: DRIVER_USER_ID,
      },
    ])
    expect(fixture.inserted[0]).not.toHaveProperty('occurrenceId')
  })

  test('ocorrência: o alvo antigo, sem conversation_id', async () => {
    const fixture = createUploadFixture(occurrenceSubject())
    await fixture.request('occurrence', OCCURRENCE_ID)
    expect(fixture.inserted).toMatchObject([
      {
        occurrenceId: OCCURRENCE_ID,
        occurrenceKind: 'document',
        requestedByUserId: DRIVER_USER_ID,
      },
    ])
    expect(fixture.inserted[0]).not.toHaveProperty('conversationId')
  })

  test('encerrada é 409; sem conversa aberta e BOLA são 404; destinatário alheio é DRIVER_CHANGED', async () => {
    const closed = createUploadFixture(subject({ documentReleasedAt: NOW }))
    expect(await failure(() => closed.request('document', DOCUMENT_ID))).toMatchObject({
      code: 'CONVERSATION_CLOSED',
      status: 409,
    })
    const notOpened = createUploadFixture(subject({ conversation: null }))
    expect(await failure(() => notOpened.request('document', DOCUMENT_ID))).toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
      status: 404,
    })
    const foreign = createUploadFixture(null)
    expect(await failure(() => foreign.request('trip', TRIP_ID))).toMatchObject({
      code: 'CONVERSATION_NOT_FOUND',
    })
    const changed = createUploadFixture(
      subject({
        conversation: { driverUserId: OTHER_USER_ID, id: CONVERSATION_ID, storedStatus: 'open' },
        isPrincipal: false,
      }),
    )
    expect(await failure(() => changed.request('document', DOCUMENT_ID))).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_DRIVER_CHANGED',
    })
    for (const fixture of [closed, notOpened, foreign, changed])
      expect(fixture.inserted).toEqual([])
  })
})
