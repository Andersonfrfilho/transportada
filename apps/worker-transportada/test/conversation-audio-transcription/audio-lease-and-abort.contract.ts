/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3, achados da revisão de concorrência: o lease cobre o pior caso de uma linha (o motor
 * usa o prazo duas vezes), o SIGTERM interrompe o motor, e a trava velha não deixa laço órfão.
 */
import { describe, expect, test } from 'bun:test'

import type { AudioRowProcessorPort } from '../../src/conversation-audio-transcription/application/audio-row-processor.js'
import { createAudioTranscriptionRunner } from '../../src/conversation-audio-transcription/application/audio-transcription.runner.js'
import { SpeechToTextError } from '../../src/conversation-audio-transcription/application/speech-to-text.port.js'
import {
  AUDIO_DECODE_TIMEOUT_MS,
  AUDIO_DOWNLOAD_TIMEOUT_MS,
  AUDIO_PROBE_TIMEOUT_MS,
  computeAudioLeaseMs,
} from '../../src/conversation-audio-transcription/domain/conversation-audio-transcription.constant.js'
import { createWhisperLocalSpeechToTextGateway } from '../../src/conversation-audio-transcription/infrastructure/whisper-local-speech-to-text.gateway.js'
import { buildFakeRow, createFakeQueue } from '../fixtures/audio-transcription-queue.fixture.js'

describe('lease da linha (spec 264 contract §5.6, revisão de concorrência)', () => {
  test('cobre o pior caso: download, ffprobe, decodificação e o motor DUAS vezes (ffmpeg + whisper-cli)', () => {
    const engineTimeoutMs = 300_000
    const worstCase =
      AUDIO_DOWNLOAD_TIMEOUT_MS +
      AUDIO_PROBE_TIMEOUT_MS +
      AUDIO_DECODE_TIMEOUT_MS +
      2 * engineTimeoutMs
    expect(computeAudioLeaseMs(engineTimeoutMs)).toBeGreaterThan(worstCase)
  })
})

describe('gateway do motor sob SIGTERM e timeout (spec 264 contract §5.8)', () => {
  const bytes = new Uint8Array([1])

  test('abortar com o motor preso devolve na hora um erro retriável, sem esperar o motor', async () => {
    const controller = new AbortController()
    const gateway = createWhisperLocalSpeechToTextGateway({
      modelName: 'm',
      transcriber: { name: 'x', transcribe: () => new Promise(() => undefined) },
    })
    const pending = gateway
      .transcribe({ bytes, languageHint: 'pt', mimeType: 'audio/ogg', signal: controller.signal })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      )
    setTimeout(() => controller.abort(), 5)
    const failure = await pending
    expect(failure).toBeInstanceOf(SpeechToTextError)
    expect((failure as SpeechToTextError).isRetriable).toBe(true)
  })

  test('conversão do ffmpeg morta por timeout (erro definitivo do pacote) ainda é engine_timeout retriável', async () => {
    const killed = Object.assign(new Error('x'), {
      cause: { killed: true, signal: 'SIGTERM' },
      engine: 'whisper.cpp',
      isRetriable: false,
      name: 'TranscriptionError',
    })
    const gateway = createWhisperLocalSpeechToTextGateway({
      modelName: 'm',
      transcriber: {
        name: 'x',
        transcribe: async () => {
          throw killed
        },
      },
    })
    const failure = await gateway
      .transcribe({
        bytes,
        languageHint: 'pt',
        mimeType: 'audio/ogg',
        signal: new AbortController().signal,
      })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      )
    expect((failure as SpeechToTextError).failureCode).toBe('engine_timeout')
    expect((failure as SpeechToTextError).isRetriable).toBe(true)
  })
})

describe('executor: trava velha não deixa laço órfão (spec 264 contract §5.8)', () => {
  test('o laço antigo é abortado, para de reivindicar e o close() espera por todos', async () => {
    let now = new Date('2026-10-12T12:00:00.000Z')
    const rows = Array.from({ length: 4 }, (_, index) =>
      buildFakeRow({ nextAttemptAt: new Date(now.getTime() - 1_000 * (10 - index)) }),
    )
    const queue = createFakeQueue({ now: () => now, rows })
    const signals: AbortSignal[] = []
    let finished = 0
    const processor: AudioRowProcessorPort = {
      process: async ({ claimed, signal }) => {
        signals.push(signal)
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()))
        await queue.release({ id: claimed.id, leaseToken: claimed.leaseToken })
        finished += 1
        return 'released'
      },
    }
    const runner = createAudioTranscriptionRunner({
      batchSize: 2,
      leaseMs: 1_000,
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      now: () => now,
      processor,
      queue,
    })

    expect(runner.start()).toBe('started')
    await Bun.sleep(5)
    now = new Date(now.getTime() + 2_001)
    expect(runner.start()).toBe('runner_lock_expired')
    await Bun.sleep(5)
    expect(signals[0]?.aborted).toBe(true)
    expect(finished).toBe(1)
    expect(queue.calls.filter((call) => call === 'claimNext')).toHaveLength(1)

    expect(runner.start()).toBe('started')
    await Bun.sleep(5)
    await runner.close()
    expect(finished).toBe(2)
    expect(rows.every((row) => row.leaseToken === null)).toBe(true)
    expect(rows.every((row) => row.attempts === 0)).toBe(true)
  })
})
