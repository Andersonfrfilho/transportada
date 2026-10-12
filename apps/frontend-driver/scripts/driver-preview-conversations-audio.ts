/** Áudios da demonstração do motorista (spec 264): os quatro estados da transcrição e um WAV mudo que toca. */
import type {
  PreviewAttachment,
  PreviewConversation,
  PreviewTranscription,
} from './driver-preview-conversations.types'

export const AUDIO_CONTENT_TYPE_PREFIX = 'audio/'

export const PREVIEW_TRANSCRIPTION_TEXT = 'Chego na portaria em dez minutos, pode liberar a doca.'

/** Teto que o servidor aplicaria (10 min, `AUDIO_TRANSCRIPTION_MAX_DURATION_MS` do worker). */
const TOO_LONG_MAX_DURATION_MS = 600_000
const SILENT_WAV_SAMPLE_RATE = 8000
const SILENT_WAV_SECONDS = 2

function buildSilentWav(): Uint8Array<ArrayBuffer> {
  const dataLength = SILENT_WAV_SAMPLE_RATE * SILENT_WAV_SECONDS
  const bytes = new Uint8Array(new ArrayBuffer(44 + dataLength))
  const view = new DataView(bytes.buffer)
  const writeText = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeText(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SILENT_WAV_SAMPLE_RATE, true)
  view.setUint32(28, SILENT_WAV_SAMPLE_RATE, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  writeText(36, 'data')
  view.setUint32(40, dataLength, true)
  bytes.fill(128, 44)
  return bytes
}

/** 8 bits sem sinal: 128 é silêncio. */
export const SILENT_WAV = buildSilentWav()

export function readyTranscription(text: string, generatedAt: string): PreviewTranscription {
  return { engine: 'whisper-local', generatedAt, language: 'pt', status: 'ready', text }
}

type AudioSample = Readonly<{
  durationMs: number
  transcription: PreviewTranscription
}>

/** pending · ready com texto · ready vazio (nada foi dito) · failed por tempo (`too_long`). */
function buildAudioSamples(generatedAt: string): readonly AudioSample[] {
  return [
    { durationMs: 12_000, transcription: { status: 'pending' } },
    {
      durationMs: 8_000,
      transcription: readyTranscription(PREVIEW_TRANSCRIPTION_TEXT, generatedAt),
    },
    { durationMs: 3_000, transcription: readyTranscription('', generatedAt) },
    {
      durationMs: 11 * 60 * 1000,
      transcription: {
        maxDurationMs: TOO_LONG_MAX_DURATION_MS,
        reason: 'too_long',
        status: 'failed',
      },
    },
  ]
}

export function buildAudioSampleAttachments(generatedAt: string): readonly PreviewAttachment[] {
  return buildAudioSamples(generatedAt).map((sample, index) => ({
    contentType: 'audio/mp4',
    durationMs: sample.durationMs,
    fileName: `audio-demo-${index + 1}.m4a`,
    id: crypto.randomUUID(),
    sizeBytes: 48_000,
    transcription: sample.transcription,
  }))
}

/** `pending → ready` em todos os anexos da conversa; devolve quantos mudaram e move `transcriptionUpdatedAt`. */
export function advanceConversationTranscriptions(
  conversation: PreviewConversation,
  generatedAt: string,
): number {
  const pending = conversation.messages
    .flatMap((message) => message.attachments)
    .filter((attachment) => attachment.transcription?.status === 'pending')
  for (const attachment of pending) {
    attachment.transcription = readyTranscription(PREVIEW_TRANSCRIPTION_TEXT, generatedAt)
  }
  if (pending.length > 0) conversation.transcriptionUpdatedAt = generatedAt
  return pending.length
}

export function findAttachmentContentType(
  conversations: readonly PreviewConversation[],
  attachmentId: string,
): string | undefined {
  return conversations
    .flatMap((conversation) => conversation.messages)
    .flatMap((message) => message.attachments)
    .find((attachment) => attachment.id === attachmentId)?.contentType
}
