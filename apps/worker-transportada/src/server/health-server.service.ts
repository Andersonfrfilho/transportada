/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CanhotoOcrReaderPort } from '../canhoto-ocr/application/canhoto-ocr-reader.port.js'
import { CANHOTO_OCR_MAX_IMAGE_BYTES } from '../canhoto-ocr/domain/canhoto-ocr.constant.js'
import { createThreadedCanhotoOcrReader } from '../canhoto-ocr/infrastructure/threaded-canhoto-ocr.reader.js'
import { isAudioTranscriptionConfigured } from '../conversation-audio-transcription/audio-transcription-configured.policy.js'
import type { SpeechToText } from '../conversation-audio-transcription/speech-to-text.port.js'
import { createWhisperLocalSpeechToText } from '../conversation-audio-transcription/whisper-local-speech-to-text.gateway.js'
import type { WorkerHealthService } from '../health/health.service.js'
import {
  BOT_AUDIO_MAX_BYTES,
  BOT_AUDIO_TRANSCRIPTION_PATH,
  createBotAudioTranscriptionHandler,
} from '../http/bot-audio-transcription-request-handler.service.js'
import {
  BOT_CANHOTO_READ_PATH,
  createBotCanhotoReadHandler,
} from '../http/bot-canhoto-read-request-handler.service.js'
import { createHealthRequestHandler } from '../http/health-request-handler.service.js'
import type {
  AudioTranscriptionEnvironment,
  WorkerEnvironment,
  WorkerLogger,
} from '../shared/worker.types.js'

const HEALTH_MAX_BODY_BYTES = 64 * 1024

/** Spec 292 T9: o invólucro do whisper-cli com o texto de contexto, instalado na imagem do worker. */
export const BOT_AUDIO_WHISPER_PROMPT_BINARY = '/usr/local/bin/whisper-cli-bot'

/**
 * O motor do áudio do bot: com `BOT_AUDIO_TRANSCRIPTION_PROMPT`, passa pelo invólucro, que chama o
 * binário configurado com o prompt. A transcrição das conversas (áudio longo) segue sem ele.
 */
export function botAudioTranscriptionEnvironment(
  environment: AudioTranscriptionEnvironment,
  prompt: string | undefined,
): AudioTranscriptionEnvironment {
  return prompt === undefined
    ? environment
    : { ...environment, binaryPath: BOT_AUDIO_WHISPER_PROMPT_BINARY }
}

export function startHealthServer(params: {
  readonly config: WorkerEnvironment
  readonly healthService: WorkerHealthService
  readonly logger: WorkerLogger
  /** Para testes: o motor da transcrição do áudio do bot. Padrão: o `whisper-cli` da imagem. */
  readonly speechToText?: SpeechToText
  /** Para testes: o leitor do canhoto. Padrão: a thread permanente do PP-OCRv4 da imagem. */
  readonly canhotoOcrReader?: CanhotoOcrReaderPort
}): Bun.Server<undefined> {
  const health = createHealthRequestHandler({
    healthService: params.healthService,
    logger: params.logger,
  })
  const botAudio = createBotAudio(params)
  const botCanhoto = createBotCanhoto(params)
  return Bun.serve({
    fetch: (request, server) => {
      if (botCanhoto !== undefined && safePathname(request.url) === BOT_CANHOTO_READ_PATH) {
        return botCanhoto(request, server)
      }
      if (botAudio !== undefined && safePathname(request.url) === BOT_AUDIO_TRANSCRIPTION_PATH) {
        return botAudio(request, server)
      }
      return health(request, server)
    },
    hostname: params.config.hostname,
    idleTimeout: 10,
    // Spec 292 T9: só a rota do áudio do bot recebe corpo grande; sem ela, o teto de sempre.
    maxRequestBodySize: Math.max(
      HEALTH_MAX_BODY_BYTES,
      botAudio === undefined ? 0 : BOT_AUDIO_MAX_BYTES,
      // A foto do canhoto vem num multipart: o teto da imagem mais a folga do envelope.
      botCanhoto === undefined ? 0 : CANHOTO_OCR_MAX_IMAGE_BYTES + HEALTH_MAX_BODY_BYTES,
    ),
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
      createWhisperLocalSpeechToText({
        environment: botAudioTranscriptionEnvironment(
          config.audioTranscription,
          config.botAudioTranscriptionPrompt,
        ),
      }),
    token,
  })
}

/** Spec 294 T4.8: a rota existe só com o token (o mesmo do áudio do bot) e o OCR ligado, com os modelos na imagem. */
function createBotCanhoto(params: {
  readonly canhotoOcrReader?: CanhotoOcrReaderPort
  readonly config: WorkerEnvironment
  readonly logger: WorkerLogger
}) {
  const token = params.config.botAudioTranscriptionToken
  const { canhotoOcr } = params.config
  if (token === undefined || canhotoOcr === undefined) return undefined
  return createBotCanhotoReadHandler({
    logger: params.logger,
    reader:
      params.canhotoOcrReader ??
      createThreadedCanhotoOcrReader({
        modelDirectory: canhotoOcr.modelDirectory,
        timeoutMilliseconds: canhotoOcr.timeoutMilliseconds,
      }),
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
