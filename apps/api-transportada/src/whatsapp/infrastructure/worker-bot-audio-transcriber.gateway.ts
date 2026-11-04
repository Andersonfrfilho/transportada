/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T9: o áudio do bot vai ao worker, dono do `whisper-cli` e do modelo (ADR-0103), pela rota
 * interna `POST /internal/bot-audio-transcriptions`. Só o texto volta; nada é gravado.
 *
 * ⚠️ Nada de texto, áudio, token ou URL em log ou em mensagem de erro.
 */
import type { BotAudioTranscriberPort } from '../application/whatsapp-bot-audio.service.js'

const TRANSCRIPTION_PATH = '/internal/bot-audio-transcriptions'
/** Cabe a fila curta do worker (uma por vez) mais o prazo do motor para um áudio de 2 minutos. */
const DEFAULT_TIMEOUT_MS = 200_000
const MIN_TOKEN_LENGTH = 32

export type WorkerBotAudioTranscriberConfig = {
  readonly baseUrl: string
  readonly timeoutMs?: number
  readonly token: string
}

export class BotAudioTranscriptionError extends Error {
  override readonly name = 'BotAudioTranscriptionError'
  constructor(readonly reason: 'busy' | 'failed' | 'unreachable') {
    super(reason)
  }
}

/** `WORKER_INTERNAL_URL` + `BOT_AUDIO_TRANSCRIPTION_TOKEN`; faltando um (ou inválido), `undefined`. */
export function readWorkerBotAudioTranscriberConfig(
  environment: Record<string, string | undefined>,
): undefined | WorkerBotAudioTranscriberConfig {
  const baseUrl = environment.WORKER_INTERNAL_URL?.trim() ?? ''
  const token = environment.BOT_AUDIO_TRANSCRIPTION_TOKEN?.trim() ?? ''
  if (baseUrl === '' || token.length < MIN_TOKEN_LENGTH) return undefined
  try {
    const url = new URL(baseUrl)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  } catch {
    return undefined
  }
  return { baseUrl, token }
}

export function createWorkerBotAudioTranscriber(
  config: WorkerBotAudioTranscriberConfig,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): BotAudioTranscriberPort {
  const url = `${config.baseUrl.replace(/\/+$/u, '')}${TRANSCRIPTION_PATH}`
  return {
    async transcribe({ audio, mimeType }) {
      let response: Response
      try {
        response = await fetchImpl(url, {
          body: audio,
          headers: {
            authorization: `Bearer ${config.token}`,
            'content-type': mimeType,
          },
          method: 'POST',
          signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        })
      } catch {
        throw new BotAudioTranscriptionError('unreachable')
      }
      if (response.status === 503) throw new BotAudioTranscriptionError('busy')
      if (!response.ok) {
        throw new BotAudioTranscriptionError(response.status === 404 ? 'unreachable' : 'failed')
      }
      const body = (await response.json().catch(() => null)) as {
        readonly data?: { readonly text?: unknown }
      } | null
      const text = body?.data?.text
      if (typeof text !== 'string') throw new BotAudioTranscriptionError('failed')
      return text
    },
  }
}
