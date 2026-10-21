/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.3 (contract.md §5.2–5.3): a etapa que acrescenta `durationMs` e `transcription` ao anexo de
 * áudio — consultas por página, empresa do contexto, anexo que não é áudio intocado — e as provas por texto
 * de fonte: só os quatro casos de uso por assunto a chamam, `signConversationAttachments` segue sem os campos,
 * e toda escrita da transcrição que muda o que a API expõe grava `updated_at = now()`.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { enrichAudioAttachments } from '../../src/occurrence-conversation/application/conversation-audio-enrichment.service.js'
import type {
  ConversationAttachmentRecord,
  ConversationAttachmentView,
} from '../../src/occurrence-conversation/application/conversation-attachment.port.js'
import type {
  AudioTranscriptionRecord,
  ConversationTranscriptionReadPort,
} from '../../src/occurrence-conversation/application/conversation-transcription.port.js'

const COMPANY_ID = 'company-1'
const SOURCE_ROOT = new URL('../../src/occurrence-conversation/', import.meta.url)

type Call = { readonly input: unknown; readonly name: string }

function createReader(state: {
  readonly isEnabled: boolean
  readonly rows?: AudioTranscriptionRecord[]
}) {
  const calls: Call[] = []
  const reader: ConversationTranscriptionReadPort = {
    findTranscriptionsByAttachmentIds: async (input) => {
      calls.push({ input, name: 'findTranscriptionsByAttachmentIds' })
      return new Map((state.rows ?? []).map((row, index) => [`audio-${index}`, row]))
    },
    readAudioTranscriptionEnabled: async (input) => {
      calls.push({ input, name: 'readAudioTranscriptionEnabled' })
      return state.isEnabled
    },
    readTranscriptionUpdatedAtByConversation: async (input) => {
      calls.push({ input, name: 'readTranscriptionUpdatedAtByConversation' })
      return new Map()
    },
  }
  return { calls, reader }
}

function record(id: string, contentType: string): ConversationAttachmentRecord {
  return {
    bucket: 'bucket',
    contentType,
    durationMs: 1000,
    fileName: 'anexo',
    id,
    messageId: `message-${id}`,
    objectKey: `key-${id}`,
    sizeBytes: 10,
  }
}

function viewOf(attachment: ConversationAttachmentRecord): ConversationAttachmentView {
  return {
    contentType: attachment.contentType,
    fileName: attachment.fileName,
    id: attachment.id,
    sizeBytes: attachment.sizeBytes,
    url: 'https://s3.test/signed',
  }
}

function viewsOf(records: readonly ConversationAttachmentRecord[]) {
  return new Map(records.map((attachment) => [attachment.messageId, [viewOf(attachment)]]))
}

const READY_ROW: AudioTranscriptionRecord = {
  audioDurationMs: null,
  engine: null,
  failureCode: null,
  generatedAt: new Date('2026-10-09T12:30:00.000Z'),
  language: null,
  maxDurationMs: null,
  status: 'ready',
  text: 'texto',
}

describe('enrichAudioAttachments (spec 264 T2.3)', () => {
  test('página sem áudio: nenhuma consulta e as views passam intactas', async () => {
    const { calls, reader } = createReader({ isEnabled: true })
    const records = [record('image-1', 'image/jpeg'), record('pdf-1', 'application/pdf')]
    const views = viewsOf(records)

    const result = await enrichAudioAttachments({ companyId: COMPANY_ID, reader, records, views })

    expect(calls).toEqual([])
    expect(result).toBe(views)
  })

  test.each([1, 10, 30])(
    'com %i áudios: uma consulta da configuração e uma das linhas, só com ids de áudio, pela empresa',
    async (size) => {
      const { calls, reader } = createReader({ isEnabled: true })
      const audios = Array.from({ length: size }, (_, index) =>
        record(`audio-${index}`, 'audio/ogg'),
      )
      const records = [...audios, record('image-1', 'image/png')]

      await enrichAudioAttachments({
        companyId: COMPANY_ID,
        reader,
        records,
        views: viewsOf(records),
      })

      expect(calls.map((call) => call.name)).toEqual([
        'readAudioTranscriptionEnabled',
        'findTranscriptionsByAttachmentIds',
      ])
      expect(calls[0]?.input).toEqual({ companyId: COMPANY_ID })
      expect(calls[1]?.input).toEqual({
        attachmentIds: audios.map((audio) => audio.id),
        companyId: COMPANY_ID,
      })
    },
  )

  test('empresa desligada: só a consulta da configuração, e todo áudio sai disabled', async () => {
    const { calls, reader } = createReader({ isEnabled: false })
    const records = [record('audio-0', 'audio/mp4')]

    const result = await enrichAudioAttachments({
      companyId: COMPANY_ID,
      reader,
      records,
      views: viewsOf(records),
    })

    expect(calls.map((call) => call.name)).toEqual(['readAudioTranscriptionEnabled'])
    expect(result.get('message-audio-0')?.[0]).toMatchObject({
      durationMs: 1000,
      transcription: { status: 'disabled' },
    })
  })

  test('anexo que não é áudio não ganha campo, ao lado de um áudio', async () => {
    const { reader } = createReader({ isEnabled: true, rows: [READY_ROW] })
    const records = [record('audio-0', 'audio/ogg'), record('image-1', 'image/jpeg')]

    const result = await enrichAudioAttachments({
      companyId: COMPANY_ID,
      reader,
      records,
      views: viewsOf(records),
    })

    expect(result.get('message-audio-0')?.[0]).toMatchObject({
      durationMs: 1000,
      transcription: { status: 'ready', text: 'texto' },
    })
    expect(JSON.stringify(result.get('message-image-1'))).toBe(
      '[{"contentType":"image/jpeg","fileName":"anexo","id":"image-1","sizeBytes":10,"url":"https://s3.test/signed"}]',
    )
  })
})

const read = (file: string) => readFile(new URL(file, SOURCE_ROOT), 'utf8')

describe('onde a etapa vive (texto de fonte)', () => {
  const USE_CASES_WITH_ENRICHMENT = [
    'application/list-my-subject-messages.use-case.ts',
    'application/reply-my-subject-conversation.use-case.ts',
    'application/list-office-subject-messages.use-case.ts',
    'application/send-office-subject-message.use-case.ts',
    /** A leitura do escritório na tela da ocorrência: o chat do painel é o SDK (21/10/2026). */
    'application/read-occurrence-conversations.use-case.ts',
  ] as const

  test.each([...USE_CASES_WITH_ENRICHMENT])(
    '%s enriquece DEPOIS de assinar, e as views assinadas entram na etapa',
    async (file) => {
      const text = await read(file)

      expect(text).toContain('enrichAudioAttachments(')
      expect(text.indexOf('enrichAudioAttachments(')).toBeLessThan(
        text.indexOf('signConversationAttachments(dependencies.storage'),
      )
      expect(text).toMatch(/views: await signConversationAttachments\(/u)
    },
  )

  test('nenhum outro arquivo de src/occurrence-conversation importa a etapa', async () => {
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(SOURCE_ROOT, { recursive: true })
    const importers: string[] = []
    for (const entry of entries.filter((name) => name.endsWith('.ts'))) {
      if ((await read(entry)).includes('conversation-audio-enrichment.service'))
        importers.push(entry)
    }

    expect(importers.toSorted()).toEqual(USE_CASES_WITH_ENRICHMENT.map((file) => file).toSorted())
  })

  test('a assinatura e a leitura de anexos não conhecem transcrição nem duração', async () => {
    const signing = await read('application/conversation-attachment.service.ts')

    for (const marker of ['transcription', 'durationMs', 'enrichAudioAttachments']) {
      expect(signing).not.toContain(marker)
    }
  })
})

describe('a escrita da transcrição sempre grava updated_at = now() do banco', () => {
  test('todo .set(...) leva updatedAt: sql`now()`', async () => {
    const text = await read('infrastructure/conversation-transcription-write.query.ts')
    const sets = text.match(/\.set\(\{[^}]*\}\)/gu) ?? []

    expect(sets.length).toBeGreaterThan(0)
    for (const set of sets) expect(set).toContain('updatedAt: sql`now()`')
  })
})
