/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.2: as linhas de transcrição e as portas de leitura falsas das suítes de contrato. A tabela de
 * casos é uma só: o mapper, a paridade com o pacote e os casos de uso leem dela.
 */
import type { AudioTranscriptionReaderPort } from '../../src/occurrence-conversation/application/conversation-audio-transcription.port.js'
import type { AudioTranscriptionRow } from '../../src/occurrence-conversation/domain/participant-transcription.policy.js'

export const GENERATED_AT = new Date('2026-10-12T10:30:00.000Z')

export function transcriptionRow(
  overrides: Partial<AudioTranscriptionRow> = {},
): AudioTranscriptionRow {
  return {
    audioDurationMs: 4200,
    engine: 'whisper-local',
    failureCode: null,
    generatedAt: null,
    language: null,
    maxDurationMs: null,
    status: 'pending',
    text: null,
    ...overrides,
  }
}

export const READY_ROW = transcriptionRow({
  generatedAt: GENERATED_AT,
  language: 'pt',
  status: 'ready',
  text: 'Cheguei na doca.',
})

export type ReaderCalls = { readonly name: string; readonly input: unknown }[]

/** A leitura falsa conta cada chamada: a prova de "constante por página" nos casos de uso. */
export function createFakeTranscriptionReader(state: {
  readonly attachmentDurations?: ReadonlyMap<string, number>
  readonly enabled?: boolean
  readonly rows?: ReadonlyMap<string, AudioTranscriptionRow>
  readonly updatedAt?: ReadonlyMap<string, Date>
}) {
  const calls: ReaderCalls = []
  const reader: AudioTranscriptionReaderPort = {
    findTranscriptionsByAttachmentIds: async (input) => {
      calls.push({ input, name: 'findTranscriptionsByAttachmentIds' })
      const found = new Map<
        string,
        { attachmentDurationMs: number | null; transcription: AudioTranscriptionRow | undefined }
      >()
      for (const attachmentId of input.attachmentIds) {
        found.set(attachmentId, {
          attachmentDurationMs: state.attachmentDurations?.get(attachmentId) ?? null,
          transcription: state.rows?.get(attachmentId),
        })
      }
      return found
    },
    readEnabled: async (input) => {
      calls.push({ input, name: 'readEnabled' })
      return state.enabled ?? true
    },
    readTranscriptionUpdatedAtByConversation: async (input) => {
      calls.push({ input, name: 'readTranscriptionUpdatedAtByConversation' })
      return state.updatedAt ?? new Map()
    },
  }
  return { calls, reader }
}

/** Para as suítes que não têm áudio: se a leitura for chamada, a suíte quebra. */
export const NO_AUDIO_TRANSCRIPTIONS: AudioTranscriptionReaderPort = {
  findTranscriptionsByAttachmentIds: async () => {
    throw new Error('transcrição lida numa página sem áudio')
  },
  readEnabled: async () => {
    throw new Error('configuração de transcrição lida numa página sem áudio')
  },
  readTranscriptionUpdatedAtByConversation: async () => new Map(),
}
