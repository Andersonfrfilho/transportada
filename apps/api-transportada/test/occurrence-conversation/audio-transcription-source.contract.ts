/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.2, por texto de fonte e provados por mutação (cada detector é exercitado contra um texto
 * adulterado antes de varrer o código):
 * - a transcrição nunca chega a um logger (RF17, LGPD): onde a tabela ou o campo é tocado, nenhuma chamada
 *   de log carrega o texto;
 * - a conversa nunca decide (183 D4): a tabela nova só é citada por quem a lê ou a configura, nunca por
 *   tratativa, taxa, acerto, aviso, e-mail ou WhatsApp.
 */
import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const SOURCE_ROOT = new URL('../../src/', import.meta.url)

/** Os identificadores da tabela e da configuração nova, e o arquivo de constantes que as nomeia. */
const TRANSCRIPTION_TOKENS = [
  'occurrenceConversationAudioTranscriptions',
  'companyAudioTranscriptionSettings',
  'occurrence_conversation_audio_transcriptions',
  'company_audio_transcription_settings',
  'conversation-audio-transcription',
] as const

/** Quem pode citar a tabela: o schema, a leitura da conversa, a configuração da empresa e a composição. */
const ALLOWED_PATH_PATTERNS = [
  /^database\/conversation-audio-transcription\.schema\.ts$/,
  /^database\/database\.schema\.ts$/,
  /^shared\/conversation-audio-transcription\.constant\.ts$/,
  /^occurrence-conversation\/(application|domain|infrastructure)\//,
  /^companies\/.*audio-transcription.*\.ts$/,
  /^main\.ts$/,
] as const

/** O que decide ou avisa: tratativa, taxa, acerto, aviso interno, e-mail e WhatsApp. */
const FORBIDDEN_PATH_PATTERNS = [
  /occurrence-case|settlement|delivery-charge|extra-charge|redelivery/,
  /^contractor-mail\//,
  /^whatsapp/,
  /^notification\//,
  /^trips\//,
  /(mail|whatsapp|notif)[^/]*\.ts$/,
] as const

const LOG_CALL = /\b(?:logger|log)\s*\.\s*(?:debug|error|info|warn)\s*\(([^)]*)\)/gs
const TRANSCRIPT_TEXT = /\btranscription\b|\btranscript(?:ion)?Text\b|\.text\b|\btext\s*:/

export function findTranscriptionPathViolations(
  files: ReadonlyMap<string, string>,
): readonly string[] {
  const violations: string[] = []
  for (const [path, source] of files) {
    if (!TRANSCRIPTION_TOKENS.some((token) => source.includes(token))) continue
    const isAllowed = ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(path))
    const isForbidden = FORBIDDEN_PATH_PATTERNS.some((pattern) => pattern.test(path))
    if (!isAllowed || isForbidden) violations.push(path)
  }
  return violations
}

export function findTranscriptionLogLeaks(files: ReadonlyMap<string, string>): readonly string[] {
  const leaks: string[] = []
  for (const [path, source] of files) {
    const touchesTranscription =
      TRANSCRIPTION_TOKENS.some((token) => source.includes(token)) ||
      /participant-transcription|ParticipantTranscription/.test(source)
    if (!touchesTranscription) continue
    for (const match of source.matchAll(LOG_CALL)) {
      if (TRANSCRIPT_TEXT.test(match[1] ?? '')) leaks.push(path)
    }
  }
  return leaks
}

async function readSources(): Promise<ReadonlyMap<string, string>> {
  const entries = (await readdir(SOURCE_ROOT, { recursive: true })).filter((file) =>
    file.endsWith('.ts'),
  )
  const files = new Map<string, string>()
  for (const entry of entries) {
    files.set(entry.replaceAll('\\', '/'), await readFile(new URL(entry, SOURCE_ROOT), 'utf8'))
  }
  return files
}

describe('a transcrição nunca chega a um logger (spec 264 T2.2, RF17)', () => {
  test('o detector pega o texto da transcrição numa chamada de log', () => {
    const mutated = new Map([
      [
        'occurrence-conversation/application/conversation-audio-enrichment.service.ts',
        `import 'participant-transcription'\nlogger.info('transcribed', { text: row.text })`,
      ],
      [
        'occurrence-conversation/application/other-audio.ts',
        `import 'participant-transcription'\nlogger.warn('lida', { transcription })`,
      ],
    ])
    expect(findTranscriptionLogLeaks(mutated)).toEqual([
      'occurrence-conversation/application/conversation-audio-enrichment.service.ts',
      'occurrence-conversation/application/other-audio.ts',
    ])
  })

  test('o detector deixa passar o log só de ids e contagens', () => {
    const clean = new Map([
      [
        'occurrence-conversation/application/conversation-audio-enrichment.service.ts',
        `import 'participant-transcription'\nlogger.info('lida', { attachments: 3 })`,
      ],
    ])
    expect(findTranscriptionLogLeaks(clean)).toEqual([])
  })

  test('nenhum arquivo de src/** que toca a transcrição a loga', async () => {
    const files = await readSources()
    expect(files.size).toBeGreaterThan(100)
    expect(findTranscriptionLogLeaks(files)).toEqual([])
  })
})

describe('a conversa nunca decide a partir da transcrição (spec 264 T2.2, 183 D4)', () => {
  test('o detector reprova tratativa, e-mail e WhatsApp citando a tabela', () => {
    const mutated = new Map([
      [
        'trips/application/occurrence-case.use-case.ts',
        'import { occurrenceConversationAudioTranscriptions } from "x"',
      ],
      [
        'contractor-mail/application/send.use-case.ts',
        'FROM occurrence_conversation_audio_transcriptions',
      ],
      ['whatsapp/application/flow.ts', 'companyAudioTranscriptionSettings'],
      ['billing/application/other.ts', 'conversation-audio-transcription'],
      [
        'occurrence-conversation/application/automatic-occurrence-mail.hook.ts',
        'conversation-audio-transcription',
      ],
    ])
    expect(findTranscriptionPathViolations(mutated)).toEqual([
      'trips/application/occurrence-case.use-case.ts',
      'contractor-mail/application/send.use-case.ts',
      'whatsapp/application/flow.ts',
      'billing/application/other.ts',
      'occurrence-conversation/application/automatic-occurrence-mail.hook.ts',
    ])
  })

  test('o detector aceita a leitura da conversa e a configuração da empresa', () => {
    const allowed = new Map([
      [
        'occurrence-conversation/infrastructure/drizzle-conversation-audio-transcription.reader.ts',
        'occurrenceConversationAudioTranscriptions',
      ],
      [
        'companies/infrastructure/drizzle-audio-transcription-settings.repository.ts',
        'companyAudioTranscriptionSettings',
      ],
    ])
    expect(findTranscriptionPathViolations(allowed)).toEqual([])
  })

  test('em src/**, só a leitura da conversa e a configuração da empresa citam a tabela', async () => {
    expect(findTranscriptionPathViolations(await readSources())).toEqual([])
  })
})
