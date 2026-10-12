/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3 (contract §5.6 passos 4–7, RF14, RF15): o que acontece com UMA linha reivindicada.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import { createAudioRowProcessor } from '../../src/conversation-audio-transcription/application/audio-row-processor.js'
import {
  AudioMeasureTimeoutError,
  SpeechToTextError,
  type AudioDurationMeterPort,
  type AudioObjectReaderPort,
  type SpeechToTextPort,
} from '../../src/conversation-audio-transcription/application/speech-to-text.port.js'
import {
  buildFakeRow,
  createFakeQueue,
  type FakeTranscriptionRow,
} from '../fixtures/audio-transcription-queue.fixture.js'

const BYTES = new Uint8Array([1, 2, 3, 4])
const BYTES_SHA = createHash('sha256').update(BYTES).digest('hex')
const MAX_DURATION_MS = 600_000
let clock = new Date('2026-10-12T12:00:00.000Z')
const now = (): Date => clock

type Overrides = {
  readonly bytes?: Uint8Array | undefined
  readonly measure?: AudioDurationMeterPort['measure']
  readonly row?: Partial<FakeTranscriptionRow>
  readonly transcribe?: SpeechToTextPort['transcribe']
}

function build(overrides: Overrides = {}) {
  clock = new Date('2026-10-12T12:00:00.000Z')
  const row = buildFakeRow({ sha256: BYTES_SHA, ...overrides.row })
  const queue = createFakeQueue({ now, rows: [row] })
  const transcriberCalls: number[] = []
  const logs: unknown[] = []
  const objectReader: AudioObjectReaderPort = {
    read: async () => ('bytes' in overrides ? overrides.bytes : BYTES),
  }
  const processor = createAudioRowProcessor({
    logger: {
      error: (...args) => logs.push(args),
      info: (...args) => logs.push(args),
      warn: (...args) => logs.push(args),
    },
    maxDurationMs: MAX_DURATION_MS,
    meter: { measure: overrides.measure ?? (async () => 5_000) },
    now,
    objectReader,
    queue,
    speechToText: {
      transcribe:
        overrides.transcribe ??
        (async () => {
          transcriberCalls.push(1)
          return { engine: 'whisper.cpp', language: 'pt', model: 'small-q5_1', text: 'ola mundo' }
        }),
    },
  })
  return { logs, processor, queue, row, transcriberCalls }
}

async function claimAndProcess(
  harness: ReturnType<typeof build>,
  signal = new AbortController().signal,
) {
  const claimed = await harness.queue.claimNext({ leaseMs: 600_000 })
  if (claimed === undefined) throw new Error('nothing claimed')
  return harness.processor.process({ claimed, signal })
}

describe('processador de uma linha de transcrição (spec 264 T3.3)', () => {
  test('caminho feliz: baixa, confere o sha256, mede, transcreve e fecha ready', async () => {
    const harness = build()
    expect(await claimAndProcess(harness)).toBe('ready')
    expect(harness.row.status).toBe('ready')
    expect(harness.row.text).toBe('ola mundo')
    expect(harness.row.durationMs).toBe(5_000)
    expect(harness.row.attempts).toBe(1)
  })

  test('too_long: duração >= teto fecha failed/too_long com o teto, sem chamar o transcritor', async () => {
    const harness = build({ measure: async () => MAX_DURATION_MS })
    expect(await claimAndProcess(harness)).toBe('failed')
    expect(harness.row.failureCode).toBe('too_long')
    expect(harness.row.maxDurationMs).toBe(MAX_DURATION_MS)
    expect(harness.row.durationMs).toBe(MAX_DURATION_MS)
    expect(harness.transcriberCalls).toHaveLength(0)
  })

  test('um milissegundo abaixo do teto ainda é transcrito', async () => {
    const harness = build({ measure: async () => MAX_DURATION_MS - 1 })
    expect(await claimAndProcess(harness)).toBe('ready')
  })

  test('anexo sem duration_ms é medido; anexo com duration_ms declarado também (o cliente não decide o teto)', async () => {
    const measured: number[] = []
    const harness = build({
      measure: async () => {
        measured.push(1)
        return MAX_DURATION_MS + 5_000
      },
      row: { declaredDurationMs: 1_000 },
    })
    expect(await claimAndProcess(harness)).toBe('failed')
    expect(measured).toHaveLength(1)
    expect(harness.row.failureCode).toBe('too_long')
    expect(harness.transcriberCalls).toHaveLength(0)
  })

  test('timeout do ffprobe/ffmpeg sobre arquivo que trava é retriável: volta a pending com backoff de 1 min', async () => {
    const harness = build({
      measure: async () => {
        throw new AudioMeasureTimeoutError()
      },
    })
    expect(await claimAndProcess(harness)).toBe('retry')
    expect(harness.row.status).toBe('pending')
    expect(harness.row.nextAttemptAt.getTime()).toBe(clock.getTime() + 60_000)
    expect(harness.transcriberCalls).toHaveLength(0)
  })

  test('backoff 1 / 5 / 30 min conforme a tentativa, e a terceira esgota em attempts_exhausted', async () => {
    const attempts = [
      { attempts: 0, minutes: 1 },
      { attempts: 1, minutes: 5 },
    ]
    for (const step of attempts) {
      const harness = build({
        row: { attempts: step.attempts },
        transcribe: async () => {
          throw new SpeechToTextError({ failureCode: 'engine_failed', isRetriable: true })
        },
      })
      expect(await claimAndProcess(harness)).toBe('retry')
      expect(harness.row.nextAttemptAt.getTime()).toBe(clock.getTime() + step.minutes * 60_000)
    }

    const last = build({
      row: { attempts: 2 },
      transcribe: async () => {
        throw new SpeechToTextError({ failureCode: 'engine_timeout', isRetriable: true })
      },
    })
    expect(await claimAndProcess(last)).toBe('failed')
    expect(last.row.failureCode).toBe('attempts_exhausted')
  })

  test('erro definitivo do transcritor fecha failed com o código dele, sem tentar de novo', async () => {
    const harness = build({
      transcribe: async () => {
        throw new SpeechToTextError({ failureCode: 'unsupported_format', isRetriable: false })
      },
    })
    expect(await claimAndProcess(harness)).toBe('failed')
    expect(harness.row.failureCode).toBe('unsupported_format')
  })

  test('erro desconhecido do transcritor é engine_failed retriável', async () => {
    const harness = build({
      transcribe: async () => {
        throw new Error('C:\\models\\ggml.bin: segredo do arquivo')
      },
    })
    expect(await claimAndProcess(harness)).toBe('retry')
    expect(harness.row.status).toBe('pending')
  })

  test('texto vazio é empty_audio definitivo', async () => {
    const harness = build({
      transcribe: async () => ({
        engine: 'whisper.cpp',
        language: 'pt',
        model: null,
        text: '  \n ',
      }),
    })
    expect(await claimAndProcess(harness)).toBe('failed')
    expect(harness.row.failureCode).toBe('empty_audio')
  })

  test('texto com U+0000 é gravado sem ele', async () => {
    const harness = build({
      transcribe: async () => ({
        engine: 'whisper.cpp',
        language: 'pt',
        model: null,
        text: 'a\u0000b c',
      }),
    })
    expect(await claimAndProcess(harness)).toBe('ready')
    expect(harness.row.text).toBe('ab c')
  })

  test('texto longo é cortado em 20 000 code points, em fronteira de palavra, contando astrais', async () => {
    const word = '😀abc '
    const text = word.repeat(10_000)
    const harness = build({
      transcribe: async () => ({ engine: 'whisper.cpp', language: 'pt', model: null, text }),
    })
    expect(await claimAndProcess(harness)).toBe('ready')
    const stored = harness.row.text ?? ''
    expect(Array.from(stored).length).toBeLessThanOrEqual(20_000)
    expect(Array.from(stored).length).toBeGreaterThan(19_990)
    expect(stored.endsWith('abc')).toBe(true)
  })

  test('sha256 divergente é definitivo e o transcritor não roda', async () => {
    const harness = build({ row: { sha256: 'b'.repeat(64) } })
    expect(await claimAndProcess(harness)).toBe('failed')
    expect(harness.row.failureCode).toBe('sha256_mismatch')
    expect(harness.transcriberCalls).toHaveLength(0)
  })

  test('objeto ausente no bucket é object_missing', async () => {
    const harness = build({ bytes: undefined })
    expect(await claimAndProcess(harness)).toBe('failed')
    expect(harness.row.failureCode).toBe('object_missing')
  })

  test('objeto deleted fecha purged sem baixar nem rodar motor', async () => {
    const harness = build({ row: { objectDeleted: true } })
    expect(await claimAndProcess(harness)).toBe('purged')
    expect(harness.row.status).toBe('purged')
    expect(harness.transcriberCalls).toHaveLength(0)
  })

  test('empresa desligada fecha failed/company_disabled sem motor', async () => {
    const harness = build()
    harness.queue.enabled.set('company-1', false)
    expect(await claimAndProcess(harness)).toBe('failed')
    expect(harness.row.failureCode).toBe('company_disabled')
    expect(harness.transcriberCalls).toHaveLength(0)
  })

  test('perdeu a posse no meio do motor: descarta o resultado e não grava', async () => {
    const harness = build({
      transcribe: async () => {
        harness.row.leaseToken = 'outra-execucao'
        return { engine: 'whisper.cpp', language: 'pt', model: null, text: 'resultado bom' }
      },
    })
    expect(await claimAndProcess(harness)).toBe('lost_lease')
    expect(harness.row.status).toBe('pending')
    expect(harness.row.text).toBeNull()
  })

  test('toda mudança exposta faz updated_at avançar (ready, failed, purged)', async () => {
    const ready = build()
    await claimAndProcess(ready)
    expect(ready.row.updatedAtVersion).toBeGreaterThan(0)

    const failed = build({ row: { sha256: 'c'.repeat(64) } })
    await claimAndProcess(failed)
    expect(failed.row.updatedAtVersion).toBeGreaterThan(0)

    const purged = build({ row: { objectDeleted: true } })
    await claimAndProcess(purged)
    expect(purged.row.updatedAtVersion).toBeGreaterThan(0)
  })

  test('abortar (SIGTERM) durante o motor solta a linha e devolve a tentativa', async () => {
    const controller = new AbortController()
    const harness = build({
      transcribe: async () => {
        controller.abort()
        throw new SpeechToTextError({ failureCode: 'engine_failed', isRetriable: true })
      },
    })
    expect(await claimAndProcess(harness, controller.signal)).toBe('released')
    expect(harness.row.status).toBe('pending')
    expect(harness.row.attempts).toBe(0)
    expect(harness.row.leaseToken).toBeNull()
  })
})
