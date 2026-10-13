/* Copyright (c) 2026 Ada Technology. MIT License. */
/** Áudio sintético da demonstração do motorista (spec 264): quatro estados de transcrição e um WAV mudo para tocar. */
import type { PreviewAttachment, PreviewTranscription } from './driver-preview-conversations.types'

export const PREVIEW_AUDIO_DOCUMENT_ID = '00000000-0000-4000-8000-000000000299'

export const PREVIEW_AUDIO_ATTACHMENT_IDS = {
  disabled: 'audio-disabled',
  failed: 'audio-failed',
  pending: 'audio-pending',
  ready: 'audio-ready',
} as const

export const PREVIEW_TRANSCRIPTION_TEXT =
  'Cheguei na doca três e estou aguardando a liberação da nota fiscal para descarregar.'

const SAMPLE_RATE = 8000
const WAV_HEADER_BYTES = 44

/** WAV PCM 8 bits mono de silêncio: o `<audio>` do navegador toca e informa a duração sem gravar nada. */
export function buildSilentWav(durationMs: number): Uint8Array<ArrayBuffer> {
  const sampleCount = Math.round((SAMPLE_RATE * durationMs) / 1000)
  const bytes = new Uint8Array(new ArrayBuffer(WAV_HEADER_BYTES + sampleCount)).fill(0x80)
  const view = new DataView(bytes.buffer)
  const writeText = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + sampleCount, true)
  writeText(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  writeText(36, 'data')
  view.setUint32(40, sampleCount, true)
  return bytes
}

export function readyTranscription(generatedAt: string): PreviewTranscription {
  return {
    engine: 'whisper-local',
    generatedAt,
    language: 'pt',
    status: 'ready',
    text: PREVIEW_TRANSCRIPTION_TEXT,
  }
}

function audioAttachment(
  input: Readonly<{
    durationMs: number
    id: string
    transcription: PreviewTranscription
  }>,
): PreviewAttachment {
  return {
    contentType: 'audio/webm',
    durationMs: input.durationMs,
    fileName: `${input.id}.webm`,
    id: input.id,
    sizeBytes: 24_000,
    transcription: input.transcription,
  }
}

/** As quatro bolhas de áudio do escritório, uma por estado de transcrição, na ordem da conversa. */
export function buildSeedAudioAttachments(now: number): readonly PreviewAttachment[] {
  return [
    audioAttachment({
      durationMs: 5000,
      id: PREVIEW_AUDIO_ATTACHMENT_IDS.pending,
      transcription: { status: 'pending' },
    }),
    audioAttachment({
      durationMs: 12_000,
      id: PREVIEW_AUDIO_ATTACHMENT_IDS.ready,
      transcription: readyTranscription(new Date(now).toISOString()),
    }),
    audioAttachment({
      durationMs: 700_000,
      id: PREVIEW_AUDIO_ATTACHMENT_IDS.failed,
      transcription: { maxDurationMs: 600_000, reason: 'too_long', status: 'failed' },
    }),
    audioAttachment({
      durationMs: 8000,
      id: PREVIEW_AUDIO_ATTACHMENT_IDS.disabled,
      transcription: { status: 'disabled' },
    }),
  ]
}
