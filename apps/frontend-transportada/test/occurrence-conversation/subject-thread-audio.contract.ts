/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 264 T5.1 (RF12): o painel grava áudio na conversa por assunto e lê `durationMs` e `transcription`
 * de cada anexo. A transcrição é validada por anexo (inválida some só o campo, a página segue) e a tela
 * antiga da ocorrência não ganha nada disso (ouro).
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'
import { PARTICIPANT_AUDIO_DURATION_MAX_MS } from '@adatechnology/conversation-contracts'

import { toConversationAttachments } from '@/modules/occurrence-conversation/shared/conversationAttachment.service'
import { SUBJECT_AUDIO_RECORDING } from '@/modules/occurrence-conversation/shared/subjectThreadAudio.constant'
import {
  buildSubjectThreadLabels,
  SUBJECT_THREAD_LABEL_KEYS,
} from '@/modules/occurrence-conversation/shared/subjectThreadLabels.service'
import { createSubjectConversationClient } from '@/modules/occurrence-conversation/shared/subjectConversationClient.service'
import { createSubjectThreadApi } from '@/modules/occurrence-conversation/shared/subjectThreadApi.service'

const SUBJECT = { subjectId: 'doc-1', subjectType: 'document', tripId: 'trip-1' } as const
const SRC = '../../src/modules/occurrence-conversation'

const READY = {
  engine: 'whisper-local',
  generatedAt: '2026-10-12T10:30:00.000Z',
  language: 'pt',
  status: 'ready',
  text: 'Cheguei no portão dois.',
} as const

function rawAudio(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contentType: 'audio/ogg',
    durationMs: 4200,
    fileName: 'voz.ogg',
    id: 'att-audio',
    sizeBytes: 900,
    transcription: READY,
    url: 'https://s.test/att-audio',
    ...overrides,
  }
}

function rawMessage(attachments: readonly unknown[]): Record<string, unknown> {
  return {
    attachments,
    authorName: 'Marcos S.',
    bodyText: '',
    channel: 'app',
    createdAt: '2026-10-12T10:00:00.000Z',
    direction: 'inbound',
    id: 'message-audio',
    status: null,
  }
}

async function listThroughAdapter(attachments: readonly unknown[]) {
  const client = createSubjectConversationClient({
    apiUrl: 'https://api.example.test',
    fetch: () => Promise.resolve(Response.json({ data: [rawMessage(attachments)] })),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
  const api = createSubjectThreadApi({ client, subject: SUBJECT })
  const messages = await api.fetchMessages(
    { subjectId: SUBJECT.subjectId, subjectType: SUBJECT.subjectType },
    undefined,
  )
  return messages[0]?.attachments ?? []
}

describe('o painel grava áudio na conversa por assunto (spec 264 T5.1)', () => {
  test('a opção de gravação é um objeto de módulo, sem teto próprio (valem os 5 min e 16 MiB do pacote)', () => {
    expect(SUBJECT_AUDIO_RECORDING).toEqual({})
  })

  test('o painel liga audioRecording ao fio, com o objeto estável', async () => {
    const source = await readFile(
      new URL(`${SRC}/components/SubjectConversationPanel.component.tsx`, import.meta.url),
      'utf8',
    )
    expect(source).toMatch(/audioRecording=\{SUBJECT_AUDIO_RECORDING\}/u)
  })

  const RECORDER_LABELS = {
    audioEmpty: [],
    audioTooLarge: [],
    discardAudio: [],
    microphoneDenied: [],
    recordAudio: [],
    recordingElapsed: ['{elapsed}', '{limit}'],
    recordingInProgress: [],
    recordingUnsupported: [],
    reviewAudio: [],
    sendAudio: [],
    stopRecording: [],
  } as const satisfies Readonly<Record<string, readonly string[]>>

  test('o fio repassa ao SDK os 11 rótulos do gravador', () => {
    const labels = buildSubjectThreadLabels((key) => `t:${key}`, 'Encerrada')
    for (const key of Object.keys(RECORDER_LABELS)) {
      expect(SUBJECT_THREAD_LABEL_KEYS as readonly string[]).toContain(key)
      expect(labels[key as keyof typeof labels]).toBe(`t:thread.labels.${key}`)
    }
  })

  for (const [locale, file] of [
    ['pt-BR', 'subjectConversation.locale.json'],
    ['en', 'subjectConversation.en.locale.json'],
  ] as const) {
    test(`${locale}: traz os rótulos do gravador com os marcadores do SDK`, async () => {
      const catalog = JSON.parse(
        await readFile(new URL(`${SRC}/locales/${file}`, import.meta.url), 'utf8'),
      ) as { thread: { labels: Record<string, string> } }
      for (const [key, placeholders] of Object.entries(RECORDER_LABELS)) {
        const value = catalog.thread.labels[key]
        expect(typeof value === 'string' && value.trim() !== '').toBe(true)
        for (const placeholder of placeholders) expect(value).toContain(placeholder)
      }
    })
  }
})

describe('o adaptador mapeia durationMs e transcription por anexo (spec 264 T5.1, RF12)', () => {
  test('áudio com duração e transcrição pronta chega ao SDK inteiro', async () => {
    const [attachment] = await listThroughAdapter([rawAudio()])
    expect(attachment).toMatchObject({ durationMs: 4200, kind: 'audio', transcription: READY })
  })

  test('os quatro estados válidos passam; a chave ausente continua ausente', async () => {
    const states = [
      { status: 'pending' },
      { status: 'disabled' },
      { maxDurationMs: 600000, reason: 'too_long', status: 'failed' },
      { status: 'failed' },
    ]
    const attachments = await listThroughAdapter(
      states.map((transcription, index) => rawAudio({ id: `att-${index}`, transcription })),
    )
    expect<unknown[]>(attachments.map((attachment) => attachment.transcription)).toEqual(states)
    const [withoutField] = await listThroughAdapter([rawAudio({ transcription: undefined })])
    expect(withoutField).toBeDefined()
    expect('transcription' in (withoutField ?? {})).toBe(false)
  })

  test('transcrição inválida some só o campo: o anexo e a página seguem', async () => {
    const invalid = [
      { status: 'inventado' },
      { ...READY, text: 'x'.repeat(40001) },
      { ...READY, generatedAt: '2026-10-12 10:30' },
      { ...READY, text: 42 },
      'ready',
      null,
    ]
    const attachments = await listThroughAdapter(
      invalid.map((transcription, index) => rawAudio({ id: `att-${index}`, transcription })),
    )
    expect(attachments).toHaveLength(invalid.length)
    for (const attachment of attachments) {
      expect('transcription' in attachment).toBe(false)
      expect(attachment.durationMs).toBe(4200)
    }
  })

  test('durationMs só passa inteiro positivo até o teto do contrato', async () => {
    const values = [-1, 0, 1.5, '4200', PARTICIPANT_AUDIO_DURATION_MAX_MS + 1, null]
    const attachments = await listThroughAdapter(
      values.map((durationMs, index) => rawAudio({ durationMs, id: `att-${index}` })),
    )
    expect(attachments).toHaveLength(values.length)
    for (const attachment of attachments) expect('durationMs' in attachment).toBe(false)
    const [edge] = await listThroughAdapter([
      rawAudio({ durationMs: PARTICIPANT_AUDIO_DURATION_MAX_MS }),
    ])
    expect(edge?.durationMs).toBe(PARTICIPANT_AUDIO_DURATION_MAX_MS)
  })

  test('anexo que não é áudio não ganha os campos mesmo se a API os mandar', async () => {
    const [image] = await listThroughAdapter([
      rawAudio({ contentType: 'image/jpeg', fileName: 'a.jpg' }),
    ])
    expect(image?.kind).toBe('image')
    expect('transcription' in (image ?? {})).toBe(false)
    expect('durationMs' in (image ?? {})).toBe(false)
  })
})

describe('a tela antiga da ocorrência fica intocada (ouro, spec 264 T5.1)', () => {
  test('toConversationAttachments não leva durationMs nem transcription', () => {
    expect(toConversationAttachments([rawAudio()])).toEqual([
      {
        contentType: 'audio/ogg',
        fileName: 'voz.ogg',
        id: 'att-audio',
        sizeBytes: 900,
        url: 'https://s.test/att-audio',
      },
    ])
  })

  test('nenhum arquivo da tela antiga conhece gravação por prop nem transcrição', async () => {
    const files = [
      'components/OccurrenceConversations.component.tsx',
      'components/ConversationMessage.component.tsx',
      'components/ConversationAttachments.component.tsx',
      'components/ConversationAudioPlayer.component.tsx',
      'components/ConversationAudioRecorder.component.tsx',
      'shared/occurrenceConversationClient.service.ts',
      'shared/conversationAttachment.service.ts',
      'shared/driverConversationClient.service.ts',
    ]
    for (const file of files) {
      const source = await readFile(new URL(`${SRC}/${file}`, import.meta.url), 'utf8')
      expect(source).not.toMatch(/transcription|audioRecording|durationMs/iu)
    }
  })
})
