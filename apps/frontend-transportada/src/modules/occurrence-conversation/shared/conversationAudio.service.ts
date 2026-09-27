/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T705 (RF17, P9): o áudio da conversa, em funções puras.
 *
 * - Gravar: o primeiro formato que o navegador grava, na ordem do `AudioRecorderButton` do pacote
 *   (OGG/Opus, M4A, WEBM). Os três estão na lista da API, que confere a assinatura dos bytes. O
 *   componente do pacote não é usado porque é Tailwind; o teto de duração é o dele.
 * - O arquivo gravado sobe como qualquer anexo: mesmo seletor, mesmos tetos por canal.
 * - Ouvir: o `<audio>` nativo, com a velocidade que o `AudioPlayer` do pacote ainda não tem.
 */
import { DEFAULT_MAX_RECORDING_MILLISECONDS } from '@adatechnology/conversations-ui'

import { CONVERSATION_ATTACHMENT_CONTENT_TYPES } from './conversationAttachment.service'

export const CONVERSATION_RECORDING_MAX_MS = DEFAULT_MAX_RECORDING_MILLISECONDS

export type ConversationRecordingFormat = Readonly<{
  extension: string
  /** O que o `MediaRecorder` recebe (com o codec, quando o navegador precisa). */
  mimeType: string
  /** O que o upload declara: o tipo da lista da API, sem parâmetros. */
  uploadMimeType: string
}>

const RECORDING_FORMATS: readonly ConversationRecordingFormat[] = [
  { extension: 'ogg', mimeType: 'audio/ogg;codecs=opus', uploadMimeType: 'audio/ogg' },
  { extension: 'm4a', mimeType: 'audio/mp4', uploadMimeType: 'audio/mp4' },
  { extension: 'webm', mimeType: 'audio/webm', uploadMimeType: 'audio/webm' },
]

/** `isTypeSupported` ausente é navegador sem `MediaRecorder`: não há o que gravar. */
export function pickRecordingFormat(
  isTypeSupported: ((mimeType: string) => boolean) | undefined,
): ConversationRecordingFormat | undefined {
  if (isTypeSupported === undefined) return undefined
  return RECORDING_FORMATS.find((format) => isTypeSupported(format.mimeType))
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function buildRecordedAudioFile(input: {
  readonly chunks: readonly Blob[]
  readonly format: ConversationRecordingFormat
  readonly now: Date
}): File {
  const { now } = input
  const stamp = `${String(now.getUTCFullYear())}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  return new File([...input.chunks], `audio-${stamp}.${input.format.extension}`, {
    type: input.format.uploadMimeType,
  })
}

export function isConversationAudio(contentType: string): boolean {
  return CONVERSATION_ATTACHMENT_CONTENT_TYPES[contentType] === 'audio'
}

export const CONVERSATION_PLAYBACK_RATES = [1, 1.5, 2] as const

export function nextPlaybackRate(current: number): number {
  const index = CONVERSATION_PLAYBACK_RATES.findIndex((rate) => rate === current)
  return CONVERSATION_PLAYBACK_RATES[(index + 1) % CONVERSATION_PLAYBACK_RATES.length] ?? 1
}

export function formatAudioDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '–'
  const totalSeconds = Math.floor(milliseconds / 1000)
  return `${String(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`
}

/**
 * A URL assinada do anexo vale 5 min, e cada leitura da conversa assina de novo. Com a leitura
 * automática da T703, o `src` trocaria a cada 20 s: o áudio que toca recomeçaria e a imagem seria
 * baixada outra vez. A mesma URL é reusada por 4 min — abaixo da validade, com folga.
 */
export const ATTACHMENT_URL_REUSE_MS = 4 * 60 * 1000

export function createAttachmentUrlCache() {
  const entries = new Map<string, { readonly at: number; readonly url: string }>()
  return {
    resolve(id: string, url: string, now: number): string {
      const cached = entries.get(id)
      if (cached !== undefined && now - cached.at < ATTACHMENT_URL_REUSE_MS) return cached.url
      entries.set(id, { at: now, url })
      return url
    },
  }
}
