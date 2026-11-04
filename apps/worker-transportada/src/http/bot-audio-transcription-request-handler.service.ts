/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T9: o áudio que o motorista manda ao bot do WhatsApp (grupo ou conversa individual) é
 * transcrito aqui, porque o `whisper-cli` e o modelo moram só na imagem do worker (ADR-0103). A API
 * baixa o áudio do provedor e manda os bytes nesta rota interna; a resposta é só o texto. Nada é
 * gravado: o texto volta para a API, que pede a confirmação da pessoa antes de usá-lo.
 *
 * A rota só existe com `BOT_AUDIO_TRANSCRIPTION_TOKEN` e com a transcrição configurada. A prova de
 * origem é o token no `authorization` (comparado em tempo constante); sem ele, 404 igual a rota que não
 * existe. Uma transcrição por vez (o motor usa todos os núcleos da cota) e fila curta: cheia, 503.
 *
 * ⚠️ Nunca loga texto nem áudio: só tamanho, duração da execução e código de falha.
 */
import { timingSafeEqual } from 'node:crypto'

import { SpeechToTextError } from '../conversation-audio-transcription/speech-to-text.error.js'
import type { SpeechToText } from '../conversation-audio-transcription/speech-to-text.port.js'
import { normalizeTranscriptionText } from '../conversation-audio-transcription/audio-transcription-text.policy.js'
import { safeLogInfo, safeLogWarn } from '../logging/safe-logger.service.js'
import type { RequestTimeoutPort, WorkerLogger } from '../shared/worker.types.js'

export const BOT_AUDIO_TRANSCRIPTION_PATH = '/internal/bot-audio-transcriptions'
/** Áudio de voz do WhatsApp (opus) tem ~1 KB/s; 8 MB cobre com folga o teto de duração da API. */
export const BOT_AUDIO_MAX_BYTES = 8 * 1024 * 1024
/** Quantas esperam atrás da que está rodando. Mais que isso, 503: a API responde "tente de novo". */
const MAX_WAITING = 3
/** O teto do Bun é 255 s; o motor tem o próprio prazo (`AUDIO_TRANSCRIPTION_TIMEOUT_MS`). */
const REQUEST_TIMEOUT_SECONDS = 240

export type BotAudioTranscriptionHandler = (
  request: Request,
  server: RequestTimeoutPort,
) => Promise<Response>

export function createBotAudioTranscriptionHandler(dependencies: {
  readonly logger: WorkerLogger
  readonly speechToText: SpeechToText
  readonly token: string
}): BotAudioTranscriptionHandler {
  const { logger, speechToText } = dependencies
  const expected = Buffer.from(`Bearer ${dependencies.token}`)
  let tail: Promise<unknown> = Promise.resolve()
  let pending = 0

  function authorized(request: Request): boolean {
    const received = Buffer.from(request.headers.get('authorization') ?? '')
    return received.length === expected.length && timingSafeEqual(received, expected)
  }

  return async (request, server) => {
    if (!authorized(request)) return json({ error: { code: 'NOT_FOUND' } }, 404)
    if (request.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405)
    const mimeType = (request.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? ''
    if (!mimeType.startsWith('audio/')) {
      return json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } }, 415)
    }
    const audio = Buffer.from(await request.arrayBuffer())
    if (audio.length === 0) return json({ error: { code: 'EMPTY_AUDIO' } }, 400)
    if (audio.length > BOT_AUDIO_MAX_BYTES) return json({ error: { code: 'TOO_LARGE' } }, 413)
    if (pending > MAX_WAITING) return json({ error: { code: 'BUSY' } }, 503)

    server.timeout(request, REQUEST_TIMEOUT_SECONDS)
    pending += 1
    const startedAt = Date.now()
    const run = tail.then(() => speechToText.transcribe({ audio, mimeType }))
    tail = run.catch(() => undefined)
    try {
      const result = await run
      const text = normalizeTranscriptionText(result.text).trim()
      safeLogInfo({
        logger,
        message: 'bot_audio_transcription.completed',
        metadata: { bytes: audio.length, durationMs: Date.now() - startedAt, empty: text === '' },
      })
      return json({ data: { text } }, 200)
    } catch (error) {
      const code = error instanceof SpeechToTextError ? error.code : 'engine_failed'
      safeLogWarn({
        logger,
        message: 'bot_audio_transcription.failed',
        metadata: { bytes: audio.length, code, durationMs: Date.now() - startedAt },
      })
      return json({ error: { code: 'TRANSCRIPTION_FAILED', reason: code } }, 502)
    } finally {
      pending -= 1
    }
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
    status,
  })
}
