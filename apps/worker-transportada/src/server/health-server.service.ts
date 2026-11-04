/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { isAudioTranscriptionConfigured } from '../conversation-audio-transcription/audio-transcription-configured.policy.js'
import type { SpeechToText } from '../conversation-audio-transcription/speech-to-text.port.js'
import { createWhisperLocalSpeechToText } from '../conversation-audio-transcription/whisper-local-speech-to-text.gateway.js'
import type { WorkerHealthService } from '../health/health.service.js'
import {
  BOT_AUDIO_MAX_BYTES,
  BOT_AUDIO_TRANSCRIPTION_PATH,
  createBotAudioTranscriptionHandler,
} from '../http/bot-audio-transcription-request-handler.service.js'
import { createHealthRequestHandler } from '../http/health-request-handler.service.js'
import type { WorkerEnvironment, WorkerLogger } from '../shared/worker.types.js'

const HEALTH_MAX_BODY_BYTES = 64 * 1024

export function startHealthServer(params: {
  readonly config: WorkerEnvironment
  readonly healthService: WorkerHealthService
  readonly logger: WorkerLogger
  /** Para testes: o motor da transcrição do áudio do bot. Padrão: o `whisper-cli` da imagem. */
  readonly speechToText?: SpeechToText
}): Bun.Server<undefined> {
  const health = createHealthRequestHandler({
    healthService: params.healthService,
    logger: params.logger,
  })
  const botAudio = createBotAudio(params)
  return Bun.serve({
    fetch: (request, server) => {
      if (botAudio !== undefined && safePathname(request.url) === BOT_AUDIO_TRANSCRIPTION_PATH) {
        return botAudio(request, server)
      }
      return health(request, server)
    },
    hostname: params.config.hostname,
    idleTimeout: 10,
    // Spec 292 T9: só a rota do áudio do bot recebe corpo grande; sem ela, o teto de sempre.
    maxRequestBodySize: botAudio === undefined ? HEALTH_MAX_BODY_BYTES : BOT_AUDIO_MAX_BYTES,
    port: params.config.port,
  })
}

/** Spec 292 T9: a rota existe só com o token e a transcrição configurados (modelo na imagem). */
function createBotAudio(params: {
  readonly config: WorkerEnvironment
  readonly logger: WorkerLogger
  readonly speechToText?: SpeechToText
}) {
  const token = params.config.botAudioTranscriptionToken
  if (token === undefined) return undefined
  const { config } = params
  if (!isAudioTranscriptionConfigured(config)) return undefined
  return createBotAudioTranscriptionHandler({
    logger: params.logger,
    speechToText:
      params.speechToText ??
      createWhisperLocalSpeechToText({ environment: config.audioTranscription }),
    token,
  })
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return '/'
  }
}
