/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 RF18/D10: a fala é dado pessoal. O log leva id, estado, código e duração — nunca o texto
 * transcrito, os bytes, o nome do arquivo nem a mensagem do erro do motor.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { createAudioTranscriptionRunner } from '../../src/conversation-audio-transcription/audio-transcription.runner.js'
import { SpeechToTextError } from '../../src/conversation-audio-transcription/speech-to-text.error.js'
import { SPEECH_TO_TEXT_FAILURE_KIND } from '../../src/conversation-audio-transcription/audio-transcription-engine.constant.js'
import {
  AUDIO_BYTES,
  createFixedProbe,
  createInstantTranscriber,
  createLogCapture,
  createMapReader,
  flushMicrotasks,
  SECRET_SPOKEN_TEXT,
} from '../fixtures/audio-transcription-doubles.fixture.js'
import {
  buildFakeRow,
  createFakeClock,
  createFakeLineQueue,
} from '../fixtures/audio-transcription-harness.fixture.js'

const SOURCE_DIRECTORY = new URL('../../src/conversation-audio-transcription/', import.meta.url)
const ENGINE_MESSAGE_WITH_PII = 'falhou em /tmp/audio-joao-da-silva-cpf-12345678909.webm'

async function runAndCollectLogs(
  transcriber: { transcribe: () => Promise<never> } | ReturnType<typeof createInstantTranscriber>,
) {
  const clock = createFakeClock()
  const rows = [buildFakeRow(), buildFakeRow({ id: 'two', objectKey: 'missing' })]
  const logs = createLogCapture()
  const runner = createAudioTranscriptionRunner({
    batchSize: 4,
    leaseMilliseconds: 495_000,
    line: {
      durationProbe: createFixedProbe(1_000),
      logger: logs.logger,
      maxDurationMilliseconds: 600_000,
      model: 'small-q5_1',
      now: clock.now,
      objectReader: createMapReader({ 'object-1': AUDIO_BYTES }),
      queue: createFakeLineQueue(rows, clock),
      speechToText: transcriber,
    },
    lockMaxAgeMilliseconds: 990_000,
  })
  runner.start()
  await flushMicrotasks()
  return logs.lines
}

describe('the audio transcription never logs what was said (spec 264 RF18)', () => {
  test('a ready line logs ids and state, without the transcribed text', async () => {
    const lines = await runAndCollectLogs(createInstantTranscriber())
    expect(lines.length).toBeGreaterThan(0)
    expect(JSON.stringify(lines)).not.toContain('motorista')
    expect(JSON.stringify(lines)).not.toContain(SECRET_SPOKEN_TEXT)
    expect(JSON.stringify(lines)).not.toContain('123.456.789-09')
  })

  test('a failing engine logs the code, never the engine message that may carry paths or speech', async () => {
    const lines = await runAndCollectLogs({
      transcribe: async () => {
        throw new SpeechToTextError({
          code: 'engine_failed',
          kind: SPEECH_TO_TEXT_FAILURE_KIND.DEFINITIVE,
        })
      },
    })
    const raw = await runAndCollectLogs({
      transcribe: async () => Promise.reject(new Error(ENGINE_MESSAGE_WITH_PII)),
    })
    expect(JSON.stringify(lines)).toContain('engine_failed')
    expect(JSON.stringify(raw)).not.toContain('joao')
    expect(JSON.stringify(raw)).not.toContain('12345678909')
  })

  test('no source file passes text, transcription or error messages to a logger', () => {
    const files = readdirSync(SOURCE_DIRECTORY).filter((name) => name.endsWith('.ts'))
    for (const name of files) {
      const source = readFileSync(join(SOURCE_DIRECTORY.pathname, name), 'utf8')
      expect(source).not.toMatch(/metadata:\s*\{[^}]*\b(text|transcription|transcript)\b/su)
      expect(source).not.toMatch(/\.message\b[^\n]*metadata|metadata[^\n]*error\.message/u)
      expect(source).not.toContain('process.env')
    }
  })
})
