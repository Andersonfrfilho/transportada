/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.2/T3.3: a medida de duração (`ffprobe`, com decodificação como reserva) e a
 * classificação do erro do motor em código estável (RF14) — nunca a mensagem do erro de origem.
 */
import { describe, expect, test } from 'bun:test'

import {
  createFfmpegAudioDurationMeter,
  type AudioCommandRunner,
} from '../../src/conversation-audio-transcription/infrastructure/ffmpeg-audio-duration.meter.js'
import {
  AudioMeasureTimeoutError,
  SpeechToTextError,
} from '../../src/conversation-audio-transcription/application/speech-to-text.port.js'
import { createWhisperLocalSpeechToTextGateway } from '../../src/conversation-audio-transcription/infrastructure/whisper-local-speech-to-text.gateway.js'

const BYTES = new Uint8Array([1, 2, 3])
const MAX_MS = 600_000

type Call = {
  readonly args: readonly string[]
  readonly command: string
  readonly timeoutMs: number
}

function runnerFrom(responses: readonly Partial<Awaited<ReturnType<AudioCommandRunner>>>[]): {
  readonly calls: Call[]
  readonly runner: AudioCommandRunner
} {
  const calls: Call[] = []
  let index = 0
  return {
    calls,
    runner: async ({ args, command, timeoutMs }) => {
      calls.push({ args, command, timeoutMs })
      const response = responses[index++] ?? {}
      return { exitCode: 0, stderr: '', stdout: '', timedOut: false, ...response }
    },
  }
}

describe('medida de duração do áudio (spec 264 T3.3)', () => {
  test('usa a duração do cabeçalho medida pelo ffprobe, em milissegundos, com timeout de 15 s', async () => {
    const { calls, runner } = runnerFrom([{ stdout: '7.123000\n' }])
    const meter = createFfmpegAudioDurationMeter({ runner })
    expect(
      await meter.measure({ bytes: BYTES, maxDurationMs: MAX_MS, mimeType: 'audio/ogg' }),
    ).toBe(7_123)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe('ffprobe')
    expect(calls[0]?.timeoutMs).toBe(15_000)
  })

  test('WebM sem duração no cabeçalho (N/A) é decodificado com teto de teto + 1 s e timeout de 60 s', async () => {
    const { calls, runner } = runnerFrom([
      { stdout: 'N/A\n' },
      { stderr: 'size=N/A time=00:01:02.50 bitrate=N/A speed=300x' },
    ])
    const meter = createFfmpegAudioDurationMeter({ runner })
    expect(
      await meter.measure({ bytes: BYTES, maxDurationMs: MAX_MS, mimeType: 'audio/webm' }),
    ).toBe(62_500)
    expect(calls[1]?.command).toBe('ffmpeg')
    expect(calls[1]?.args).toContain('-t')
    expect(calls[1]?.args[calls[1].args.indexOf('-t') + 1]).toBe('601')
    expect(calls[1]?.timeoutMs).toBe(60_000)
  })

  test('a decodificação que bate no teto devolve pelo menos o teto, o que fecha too_long', async () => {
    const { runner } = runnerFrom([{ stdout: 'N/A\n' }, { stderr: 'time=00:10:01.00 bitrate=N/A' }])
    const meter = createFfmpegAudioDurationMeter({ runner })
    const measured = await meter.measure({
      bytes: BYTES,
      maxDurationMs: MAX_MS,
      mimeType: 'audio/webm',
    })
    expect(measured).toBeGreaterThanOrEqual(MAX_MS)
  })

  test('timeout do ffprobe é retriável (AudioMeasureTimeoutError)', async () => {
    const { runner } = runnerFrom([{ timedOut: true, exitCode: null }])
    const meter = createFfmpegAudioDurationMeter({ runner })
    await expect(
      meter.measure({ bytes: BYTES, maxDurationMs: MAX_MS, mimeType: 'audio/ogg' }),
    ).rejects.toBeInstanceOf(AudioMeasureTimeoutError)
  })

  test('timeout da decodificação também é retriável', async () => {
    const { runner } = runnerFrom([{ stdout: 'N/A' }, { timedOut: true, exitCode: null }])
    const meter = createFfmpegAudioDurationMeter({ runner })
    await expect(
      meter.measure({ bytes: BYTES, maxDurationMs: MAX_MS, mimeType: 'audio/webm' }),
    ).rejects.toBeInstanceOf(AudioMeasureTimeoutError)
  })

  test('arquivo que o ffprobe recusa (não é áudio) devolve undefined em vez de lançar', async () => {
    const { runner } = runnerFrom([{ exitCode: 1, stderr: 'Invalid data found' }])
    const meter = createFfmpegAudioDurationMeter({ runner })
    expect(
      await meter.measure({ bytes: BYTES, maxDurationMs: MAX_MS, mimeType: 'audio/ogg' }),
    ).toBeUndefined()
  })

  test('duração zero ou negativa não é duração', async () => {
    const { runner } = runnerFrom([{ stdout: '0.000000' }, { stderr: 'time=00:00:00.00' }])
    const meter = createFfmpegAudioDurationMeter({ runner })
    expect(
      await meter.measure({ bytes: BYTES, maxDurationMs: MAX_MS, mimeType: 'audio/ogg' }),
    ).toBeUndefined()
  })
})

describe('gateway do whisper local (spec 264 T3.2, RF14)', () => {
  const input = {
    bytes: BYTES,
    languageHint: 'pt',
    mimeType: 'audio/ogg',
    signal: new AbortController().signal,
  }

  function gatewayFailingWith(error: unknown) {
    return createWhisperLocalSpeechToTextGateway({
      modelName: 'small-q5_1',
      transcriber: {
        name: 'whisper.cpp',
        transcribe: async () => {
          throw error
        },
      },
    })
  }

  class FakeEngineError extends Error {
    constructor(
      message: string,
      readonly engine: string,
      readonly isRetriable: boolean,
      override readonly cause?: unknown,
    ) {
      super(message)
      this.name = 'TranscriptionError'
    }
  }

  async function classify(error: unknown): Promise<SpeechToTextError> {
    const failure = await gatewayFailingWith(error)
      .transcribe(input)
      .then(
        () => undefined,
        (caught: unknown) => caught,
      )
    expect(failure).toBeInstanceOf(SpeechToTextError)
    return failure as SpeechToTextError
  }

  test('devolve só texto, idioma da dica, motor e modelo', async () => {
    const gateway = createWhisperLocalSpeechToTextGateway({
      modelName: 'small-q5_1',
      transcriber: {
        name: 'whisper.cpp',
        transcribe: async () => ({ engine: 'whisper.cpp', language: 'en', text: 'oi' }),
      },
    })
    expect(await gateway.transcribe(input)).toEqual({
      engine: 'whisper.cpp',
      language: 'pt',
      model: 'small-q5_1',
      text: 'oi',
    })
  })

  test('timeout do processo (ETIMEDOUT/killed) é engine_timeout retriável', async () => {
    const error = await classify(
      new FakeEngineError(
        'x',
        'whisper.cpp',
        true,
        Object.assign(new Error('t'), { code: 'ETIMEDOUT' }),
      ),
    )
    expect(error.failureCode).toBe('engine_timeout')
    expect(error.isRetriable).toBe(true)
  })

  test('erro retriável genérico do motor é engine_failed retriável', async () => {
    const error = await classify(new FakeEngineError('x', 'whisper.cpp', true))
    expect(error.failureCode).toBe('engine_failed')
    expect(error.isRetriable).toBe(true)
  })

  test('formato não suportado é definitivo', async () => {
    const unsupported = Object.assign(new FakeEngineError('x', 'whisper.cpp', false), {
      mimeType: 'audio/amr',
      name: 'TranscriptionUnsupportedError',
    })
    const error = await classify(unsupported)
    expect(error.failureCode).toBe('unsupported_format')
    expect(error.isRetriable).toBe(false)
  })

  test('erro definitivo genérico do motor é engine_failed definitivo', async () => {
    const error = await classify(
      new FakeEngineError('Falha ao converter áudio para WAV', 'whisper.cpp', false),
    )
    expect(error.failureCode).toBe('engine_failed')
    expect(error.isRetriable).toBe(false)
  })

  test('erro desconhecido é engine_failed retriável e a mensagem de origem não vaza', async () => {
    const error = await classify(new Error('/models/ggml-small.bin: Joao da Silva'))
    expect(error.failureCode).toBe('engine_failed')
    expect(error.isRetriable).toBe(true)
    expect(error.message).not.toContain('/models')
    expect(error.message).not.toContain('Joao')
  })

  test('sinal abortado antes do motor devolve engine_failed retriável sem chamar o motor', async () => {
    const controller = new AbortController()
    controller.abort()
    let called = false
    const gateway = createWhisperLocalSpeechToTextGateway({
      modelName: 'm',
      transcriber: {
        name: 'whisper.cpp',
        transcribe: async () => {
          called = true
          return { engine: 'x', text: 'y' }
        },
      },
    })
    await expect(
      gateway.transcribe({ ...input, signal: controller.signal }),
    ).rejects.toBeInstanceOf(SpeechToTextError)
    expect(called).toBe(false)
  })
})
