/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 264 T5.1 (contract §1, §2, §4): o painel lê o áudio e a transcrição da conversa por assunto
 * campo a campo (valor novo nunca derruba a mensagem), liga a gravação do SDK e traz os rótulos do
 * gravador e do player nos dois idiomas. A tela antiga da ocorrência não ganha nada.
 */
import { readFile } from 'node:fs/promises'

import { DEFAULT_PARTICIPANT_AUDIO_LABELS } from '@adatechnology/conversations-ui/participant'
import { describe, expect, test } from 'bun:test'

import { CONVERSATION_ATTACHMENT_LIMITS } from '@/modules/occurrence-conversation/shared/conversationAttachment.service'
import { createSubjectConversationClient } from '@/modules/occurrence-conversation/shared/subjectConversationClient.service'
import { SUBJECT_AUDIO_RECORDING_OPTIONS } from '@/modules/occurrence-conversation/shared/subjectAudioRecording.service'
import { createSubjectThreadApi } from '@/modules/occurrence-conversation/shared/subjectThreadApi.service'
import { SUBJECT_THREAD_LABEL_KEYS } from '@/modules/occurrence-conversation/shared/subjectThreadLabels.service'
import type { SubjectConversationClient } from '@/modules/occurrence-conversation/shared/subjectConversationClient.service'

const API_URL = 'https://api.example.test'
const SUBJECT = { subjectId: 'doc-1', subjectType: 'document', tripId: 'trip-1' } as const
const REF = { subjectId: 'doc-1', subjectType: 'document' }
const MODULE = '../../src/modules/occurrence-conversation/'

const AUDIO_ATTACHMENT = {
  contentType: 'audio/ogg',
  fileName: 'audio.ogg',
  id: 'att-audio',
  sizeBytes: 900,
  url: 'https://s.test/att-audio',
}

const INBOUND = {
  attachments: [AUDIO_ATTACHMENT],
  authorName: 'Marcos S.',
  bodyText: '',
  channel: 'app',
  createdAt: '2026-10-09T12:00:00.000Z',
  direction: 'inbound',
  id: 'message-1',
  status: null,
}

function createClient(attachments: readonly unknown[]): SubjectConversationClient {
  return createSubjectConversationClient({
    apiUrl: API_URL,
    fetch: () => Promise.resolve(Response.json({ data: [{ ...INBOUND, attachments }] })),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

async function readAttachment(raw: Record<string, unknown>) {
  const messages = await createClient([{ ...AUDIO_ATTACHMENT, ...raw }]).listMessages(SUBJECT)
  expect(messages).toHaveLength(1)
  const [attachment] = messages[0]?.attachments ?? []
  expect(attachment).toMatchObject(AUDIO_ATTACHMENT)
  return attachment
}

const READY = {
  generatedAt: '2026-10-09T12:00:30.000Z',
  status: 'ready',
  text: 'Chego às 14h.',
} as const

async function readTranscription(raw: Record<string, unknown>): Promise<unknown> {
  return (await readAttachment(raw))?.transcription
}

describe('a leitura do áudio e da transcrição no painel (contract §1)', () => {
  test('anexo válido passa com a transcrição e a duração', async () => {
    const attachment = await readAttachment({
      durationMs: 4200,
      transcription: { ...READY, engine: 'whisper-local', language: 'pt' },
    })
    expect(attachment).toMatchObject({
      durationMs: 4200,
      transcription: { ...READY, engine: 'whisper-local', language: 'pt' },
    })
  })

  test('os quatro estados válidos chegam; o texto só existe em ready', async () => {
    for (const status of ['pending', 'disabled'] as const) {
      const attachment = await readTranscription({ transcription: { status, text: 'solto' } })
      expect(attachment).toEqual({ status })
    }
    const tooLong = { maxDurationMs: 600_000, reason: 'too_long', status: 'failed' }
    expect(await readTranscription({ transcription: tooLong })).toEqual(tooLong)
    const empty = { ...READY, text: '' }
    expect(await readTranscription({ transcription: empty })).toEqual(empty)
  })

  test('sem os campos: o anexo é o de sempre, sem chave nova', async () => {
    const attachment = await readAttachment({})
    expect(attachment).not.toHaveProperty('transcription')
    expect(attachment).not.toHaveProperty('durationMs')
  })

  const MALFORMED: readonly (readonly [string, unknown])[] = [
    ['status desconhecido', { status: 'archived' }],
    ['sem status', { text: 'x' }],
    ['text objeto', { ...READY, text: { value: 'x' } }],
    ['text acima do teto', { ...READY, text: 'a'.repeat(40_001) }],
    ['language null', { ...READY, language: null }],
    ['generatedAt com offset', { ...READY, generatedAt: '2026-10-09T12:00:30+03:00' }],
    ['generatedAt sem fuso', { ...READY, generatedAt: '2026-10-09T12:00:30' }],
    ['não é objeto', 'ready'],
    ['null', null],
  ]

  for (const [name, transcription] of MALFORMED) {
    test(`transcrição malformada (${name}): só o campo some; player, mensagem e lista seguem`, async () => {
      const attachment = await readAttachment({ durationMs: 1500, transcription })
      expect(attachment).not.toHaveProperty('transcription')
      expect(attachment).toMatchObject({ durationMs: 1500 })
    })
  }

  for (const durationMs of [-1, 0, 1.5, '4200', null, 86_400_001, Number.NaN]) {
    test(`durationMs inválido (${String(durationMs)}): o campo some, a transcrição fica`, async () => {
      const attachment = await readAttachment({ durationMs, transcription: READY })
      expect(attachment).not.toHaveProperty('durationMs')
      expect(attachment).toMatchObject({ transcription: READY })
    })
  }

  test('um anexo malformado não derruba o vizinho nem a lista', async () => {
    const second = { ...AUDIO_ATTACHMENT, id: 'att-2', url: 'https://s.test/att-2' }
    const client = createClient([
      { ...AUDIO_ATTACHMENT, transcription: { status: 'future' } },
      { ...second, transcription: READY },
    ])
    const [message] = await client.listMessages(SUBJECT)
    expect(message?.attachments.map((item) => item.id)).toEqual(['att-audio', 'att-2'])
    expect(message?.attachments[0]).not.toHaveProperty('transcription')
    expect(message?.attachments[1]).toMatchObject({ transcription: READY })
  })

  test('a guarda compartilhada e a tela antiga não ganham campo (ouro)', async () => {
    const guard = await readFile(
      new URL(`${MODULE}shared/conversationAttachment.service.ts`, import.meta.url),
      'utf8',
    )
    const types = await readFile(
      new URL(`${MODULE}shared/occurrenceConversation.types.ts`, import.meta.url),
      'utf8',
    )
    const oldScreen = await readFile(
      new URL(`${MODULE}components/OccurrenceConversations.component.tsx`, import.meta.url),
      'utf8',
    )
    for (const source of [guard, types, oldScreen]) {
      expect(source).not.toMatch(/transcription|durationMs|audioRecording/u)
    }
  })
})

describe('o adaptador entrega os campos ao SDK (contract §1)', () => {
  test('transcrição e duração viram campos do ParticipantAttachment; ausentes, ficam ausentes', async () => {
    const client = createClient([
      { ...AUDIO_ATTACHMENT, durationMs: 4200, transcription: READY },
      { ...AUDIO_ATTACHMENT, id: 'att-bare', url: 'https://s.test/att-bare' },
    ])
    const api = createSubjectThreadApi({ client, subject: SUBJECT })
    const [message] = await api.fetchMessages(REF)
    expect(message?.attachments[0]).toMatchObject({
      durationMs: 4200,
      kind: 'audio',
      transcription: READY,
    })
    expect(message?.attachments[1]).not.toHaveProperty('transcription')
    expect(message?.attachments[1]).not.toHaveProperty('durationMs')
  })

  test('o áudio gravado sai como anexo, pelo mesmo upload e a mesma chave de idempotência', async () => {
    const requests: unknown[] = []
    const sends: unknown[] = []
    const client: SubjectConversationClient = {
      ...createClient([]),
      putUpload: () => Promise.resolve(),
      requestUpload: (input) => {
        requests.push(input)
        return Promise.resolve({ uploadId: 'upload-1', uploadUrl: 'https://s.test/u' })
      },
      sendMessage: (input) => {
        sends.push(input)
        return Promise.resolve(null)
      },
    }
    const api = createSubjectThreadApi({ client, subject: SUBJECT })
    const file = new File(['x'], 'audio-20261012-101500.ogg', { type: 'audio/ogg' })
    await api.sendMessage({ clientMessageId: 'client-message-0002', files: [file], subject: REF })
    expect(requests).toMatchObject([
      { contentType: 'audio/ogg', fileName: file.name, sizeBytes: 1 },
    ])
    expect(sends).toMatchObject([
      {
        attachmentIds: ['upload-1'],
        body: '',
        idempotencyKey: 'subject-message:client-message-0002',
      },
    ])
  })
})

describe('a gravação no painel (contract §2)', () => {
  test('o teto de bytes é o menor entre o do SDK e o do canal app; a duração fica no padrão', () => {
    expect(SUBJECT_AUDIO_RECORDING_OPTIONS.maxSizeBytes).toBe(
      Math.min(16 * 1024 * 1024, CONVERSATION_ATTACHMENT_LIMITS.app.audio),
    )
    expect(SUBJECT_AUDIO_RECORDING_OPTIONS).not.toHaveProperty('maxDurationMs')
    expect(SUBJECT_AUDIO_RECORDING_OPTIONS).not.toHaveProperty('onCaptureChange')
  })

  test('o painel passa a prop ao fio do escritório', async () => {
    const panel = await readFile(
      new URL(`${MODULE}components/SubjectConversationPanel.component.tsx`, import.meta.url),
      'utf8',
    )
    expect(panel).toContain('audioRecording={SUBJECT_AUDIO_RECORDING_OPTIONS}')
    expect(panel).toContain('perspective="operator"')
  })
})

describe('os rótulos do gravador, do player e da transcrição (contract §4)', () => {
  const PACKAGE_KEYS = [
    ...Object.keys(DEFAULT_PARTICIPANT_AUDIO_LABELS),
    'messageOptions',
    'showOriginalText',
  ]

  test('todo rótulo do pacote está em SUBJECT_THREAD_LABEL_KEYS e nos dois idiomas', async () => {
    const keys: readonly string[] = SUBJECT_THREAD_LABEL_KEYS
    for (const file of ['subjectConversation.locale.json', 'subjectConversation.en.locale.json']) {
      const locale = JSON.parse(
        await readFile(new URL(`${MODULE}locales/${file}`, import.meta.url), 'utf8'),
      ) as {
        thread: { labels: Record<string, string> }
      }
      for (const key of PACKAGE_KEYS) {
        expect(keys).toContain(key)
        expect(locale.thread.labels[key]).toBeTruthy()
      }
    }
  })

  test('os placeholders do pacote sobrevivem à tradução', async () => {
    for (const file of ['subjectConversation.locale.json', 'subjectConversation.en.locale.json']) {
      const locale = JSON.parse(
        await readFile(new URL(`${MODULE}locales/${file}`, import.meta.url), 'utf8'),
      ) as {
        thread: { labels: Record<string, string> }
      }
      for (const [key, value] of Object.entries(DEFAULT_PARTICIPANT_AUDIO_LABELS)) {
        const placeholders = value.match(/\{\w+\}/gu) ?? []
        for (const placeholder of placeholders)
          expect(locale.thread.labels[key]).toContain(placeholder)
      }
    }
  })
})
