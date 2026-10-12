/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.2/T2.3 (contract.md §5.2): os quatro casos de uso por assunto devolvem `durationMs` e
 * `transcription` só no anexo de áudio, com consultas constantes por página (nenhuma sem áudio; a da
 * configuração mais a das linhas com áudio; só a da configuração com a empresa desligada).
 */
import { describe, expect, test } from 'bun:test'

import type { ConversationAttachmentRecord } from '../../src/occurrence-conversation/application/conversation-attachment.port.js'
import type { SubjectMessageRecord } from '../../src/occurrence-conversation/application/driver-conversation-subject.port.js'
import { createListMySubjectMessagesUseCase } from '../../src/occurrence-conversation/application/list-my-subject-messages.use-case.js'
import { createListOfficeSubjectMessagesUseCase } from '../../src/occurrence-conversation/application/list-office-subject-messages.use-case.js'
import { SIGNING_ATTACHMENT_STORAGE } from '../fixtures/conversation-attachment.fixture.js'
import {
  createFakeTranscriptionReader,
  GENERATED_AT,
  READY_ROW,
} from '../fixtures/participant-transcription.fixture.js'
import { createFake } from './driver-subject-conversation.contract.js'
import { createWorld as createReplyWorld } from './driver-subject-conversation-write.contract.js'
import { createWorld as createOfficeWorld } from './office-subject-conversation.contract.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000260001'
const AUDIO_READY_ID = '00000000-0000-4000-8000-000000264101'
const AUDIO_BARE_ID = '00000000-0000-4000-8000-000000264102'
const IMAGE_ID = '00000000-0000-4000-8000-000000264103'
const NOW = new Date('2026-10-12T12:00:00.000Z')

function attachment(id: string, contentType: string): ConversationAttachmentRecord {
  return {
    bucket: 'bucket',
    contentType,
    fileName: `${id}.bin`,
    id,
    messageId: 'message-1',
    objectKey: `key/${id}`,
    sizeBytes: 100,
  }
}

const MIXED = [
  attachment(AUDIO_READY_ID, 'audio/ogg'),
  attachment(AUDIO_BARE_ID, 'audio/mp4'),
  attachment(IMAGE_ID, 'image/jpeg'),
]

function mixedReader(overrides: { enabled?: boolean } = {}) {
  return createFakeTranscriptionReader({
    attachmentDurations: new Map([[AUDIO_BARE_ID, 5000]]),
    ...(overrides.enabled === undefined ? {} : { enabled: overrides.enabled }),
    rows: new Map([[AUDIO_READY_ID, READY_ROW]]),
  })
}

const READY_VIEW = {
  generatedAt: GENERATED_AT.toISOString(),
  language: 'pt',
  status: 'ready',
  text: 'Cheguei na doca.',
}

function viewsById(attachments: readonly { readonly id: string }[]) {
  return new Map(attachments.map((found) => [found.id, found]))
}

function message(id: string): SubjectMessageRecord {
  return {
    authorName: null,
    bodyText: '',
    channel: 'app',
    clientMessageId: null,
    createdAt: NOW,
    direction: 'inbound',
    id,
    status: null,
  }
}

describe('o motorista lê as mensagens por assunto com a transcrição (spec 264 T2.2/T2.3)', () => {
  const identity = {
    companyId: COMPANY_ID,
    driverId: '00000000-0000-4000-8000-000000260002',
    driverUserId: '00000000-0000-4000-8000-000000260003',
    subjectId: '00000000-0000-4000-8000-000000260006',
    subjectType: 'document',
  } as const
  const subject = {
    conversation: {
      driverUserId: identity.driverUserId,
      id: '00000000-0000-4000-8000-000000260007',
      storedStatus: 'open',
    },
    documentReleasedAt: null,
    isPrincipal: true,
    occurrenceKind: null,
    subjectId: identity.subjectId,
    subjectType: 'document',
    tripId: '00000000-0000-4000-8000-000000260005',
    tripStatus: 'in_transit',
  } as const

  async function list(state: Parameters<typeof createFake>[0]) {
    const fake = createFake({ messages: [message('message-1')], subject, ...state })
    const messages = await createListMySubjectMessagesUseCase({
      clock: () => NOW,
      storage: SIGNING_ATTACHMENT_STORAGE,
      unitOfWork: fake.unitOfWork,
    }).list(identity)
    return viewsById(messages.flatMap((found) => found.attachments))
  }

  test('só o áudio ganha durationMs e transcription; imagem sai igual a de antes', async () => {
    const reader = mixedReader()
    const found = await list({ attachments: MIXED, audioTranscriptions: reader.reader })

    expect(found.get(AUDIO_READY_ID)).toMatchObject({
      durationMs: 4200,
      transcription: READY_VIEW,
    })
    expect(found.get(AUDIO_BARE_ID)).toMatchObject({ durationMs: 5000 })
    expect(found.get(AUDIO_BARE_ID)).not.toHaveProperty('transcription')
    expect(Object.keys(found.get(IMAGE_ID) ?? {}).toSorted()).toEqual([
      'contentType',
      'fileName',
      'id',
      'sizeBytes',
      'url',
    ])
  })

  test('consultas constantes: configuração + linhas (uma vez só, com todos os áudios da página)', async () => {
    const reader = mixedReader()
    await list({ attachments: MIXED, audioTranscriptions: reader.reader })
    expect(reader.calls.map((call) => call.name)).toEqual([
      'readEnabled',
      'findTranscriptionsByAttachmentIds',
    ])
    expect(reader.calls[1]?.input).toEqual({
      attachmentIds: [AUDIO_READY_ID, AUDIO_BARE_ID],
      companyId: COMPANY_ID,
    })
  })

  test('página sem áudio: nenhuma consulta de transcrição', async () => {
    const reader = mixedReader()
    await list({
      attachments: [attachment(IMAGE_ID, 'image/jpeg')],
      audioTranscriptions: reader.reader,
    })
    expect(reader.calls).toEqual([])
  })

  test('empresa desligada: disabled sem ler nenhuma linha', async () => {
    const reader = mixedReader({ enabled: false })
    const found = await list({ attachments: MIXED, audioTranscriptions: reader.reader })
    expect(found.get(AUDIO_READY_ID)).toMatchObject({ transcription: { status: 'disabled' } })
    expect(reader.calls.map((call) => call.name)).toEqual(['readEnabled'])
  })
})

describe('o escritório lê e envia por assunto com a transcrição (spec 264 T2.2/T2.3)', () => {
  const note = {
    companyId: '00000000-0000-4000-8000-000000260401',
    subjectId: '00000000-0000-4000-8000-000000260403',
    subjectType: 'document',
    tripId: '00000000-0000-4000-8000-000000260402',
  } as const

  test('a lista do escritório traz os campos só no áudio', async () => {
    const reader = mixedReader()
    const world = createOfficeWorld({
      attachments: MIXED,
      audioTranscriptions: reader.reader,
      messages: [message('message-1')],
    })
    const messages = await createListOfficeSubjectMessagesUseCase({
      storage: SIGNING_ATTACHMENT_STORAGE,
      unitOfWork: world.unitOfWork,
    }).list(note)
    const found = viewsById(messages.flatMap((entry) => entry.attachments))

    expect(found.get(AUDIO_READY_ID)).toMatchObject({ durationMs: 4200, transcription: READY_VIEW })
    expect(found.get(IMAGE_ID)).not.toHaveProperty('transcription')
    expect(found.get(IMAGE_ID)).not.toHaveProperty('durationMs')
    expect(reader.calls.map((call) => call.name)).toEqual([
      'readEnabled',
      'findTranscriptionsByAttachmentIds',
    ])
  })

  test('o envio do escritório devolve a mensagem com o áudio enriquecido', async () => {
    const reader = mixedReader()
    const world = createOfficeWorld({ attachments: MIXED, audioTranscriptions: reader.reader })
    const result = await world.send.send({
      ...note,
      actorUserId: '00000000-0000-4000-8000-000000260407',
      bodyText: 'Pode subir?',
      idempotencyKey: 'office-audio-key-0001',
    })
    const found = viewsById(result.message.attachments)
    expect(found.get(AUDIO_READY_ID)).toMatchObject({ transcription: READY_VIEW })
    expect(found.get(IMAGE_ID)).not.toHaveProperty('transcription')
  })
})

describe('a resposta do motorista devolve a mensagem com o áudio enriquecido (spec 264 T2.2)', () => {
  test('reply por assunto', async () => {
    const reader = mixedReader()
    const world = createReplyWorld({ attachments: MIXED, audioTranscriptions: reader.reader })
    const result = await world.reply.reply({
      bodyText: 'Segue o áudio',
      companyId: '00000000-0000-4000-8000-000000260201',
      driverId: '00000000-0000-4000-8000-000000260202',
      driverUserId: '00000000-0000-4000-8000-000000260203',
      idempotencyKey: 'driver-audio-key-0001',
      subjectId: '00000000-0000-4000-8000-000000260206',
      subjectType: 'document',
    })
    const found = viewsById(result.message.attachments)
    expect(found.get(AUDIO_READY_ID)).toMatchObject({ transcription: READY_VIEW })
    expect(found.get(IMAGE_ID)).not.toHaveProperty('transcription')
  })
})
