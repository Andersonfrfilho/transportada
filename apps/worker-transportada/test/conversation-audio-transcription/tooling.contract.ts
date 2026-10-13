/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (revisão da T3.4, H3): com o modelo configurado e uma ferramenta ausente, a rotina não é
 * registrada e o boot segue verde, com erro claro no log (só nomes, sem caminho nem segredo).
 */
import { describe, expect, test } from 'bun:test'

import {
  checkAudioTranscriptionTooling,
  type AudioTranscriptionToolingProbe,
} from '../../src/conversation-audio-transcription/audio-transcription-tooling.policy.js'
import { registerAudioTranscriptionRuntime } from '../../src/conversation-audio-transcription/build-audio-transcription-runtime.js'
import type { AudioTranscriptionEnvironment } from '../../src/shared/worker.types.js'
import {
  createInstantTranscriber,
  createLogCapture,
  createMapReader,
} from '../fixtures/audio-transcription-doubles.fixture.js'

const ENVIRONMENT: AudioTranscriptionEnvironment = {
  batchSize: 2,
  binaryPath: '/opt/whisper/whisper-cli-secret-path',
  language: 'pt',
  maxDurationMilliseconds: 600_000,
  modelPath: '/models/ggml-small-q5_1.bin',
  recoveryWindowHours: 72,
  threads: 2,
  timeoutMilliseconds: 300_000,
}

function probeWithout(missing: { binary?: string; path?: string }): AudioTranscriptionToolingProbe {
  return {
    exists: (path) => path !== missing.path,
    which: (binary) => (binary === missing.binary ? null : `/usr/bin/${binary}`),
  }
}

describe('audio transcription tooling check at boot (spec 264 H3)', () => {
  test('everything present reports nothing missing', () => {
    expect(
      checkAudioTranscriptionTooling({ environment: ENVIRONMENT, probe: probeWithout({}) }),
    ).toEqual([])
  })

  test.each([
    ['whisper binary', { binary: ENVIRONMENT.binaryPath }, 'whisper_binary'],
    ['ffprobe', { binary: 'ffprobe' }, 'ffprobe'],
    ['ffmpeg', { binary: 'ffmpeg' }, 'ffmpeg'],
    ['model file', { path: ENVIRONMENT.modelPath }, 'model'],
  ])('a missing %s is reported alone', (_name, missing, expected) => {
    expect(
      checkAudioTranscriptionTooling({ environment: ENVIRONMENT, probe: probeWithout(missing) }),
    ).toEqual([expected] as never)
  })

  test('with a tool missing the routine is not registered and the error names only what is missing', () => {
    const logs = createLogCapture()
    const runtime = registerAudioTranscriptionRuntime({
      database: {} as never,
      environment: ENVIRONMENT,
      logger: logs.logger,
      objectReader: createMapReader({}),
      speechToText: createInstantTranscriber(),
      toolingProbe: probeWithout({ binary: 'ffmpeg' }),
    })
    expect(runtime).toBeUndefined()
    const [line] = logs.lines
    expect(line).toMatchObject({
      level: 'error',
      message: 'audio_transcription_tooling_missing',
      metadata: { missing: ['ffmpeg'] },
    })
    expect(JSON.stringify(logs.lines)).not.toContain('secret-path')
  })

  test('with everything present the routine and its runner are built', () => {
    const runtime = registerAudioTranscriptionRuntime({
      database: {} as never,
      environment: ENVIRONMENT,
      logger: createLogCapture().logger,
      objectReader: createMapReader({}),
      speechToText: createInstantTranscriber(),
      toolingProbe: probeWithout({}),
    })
    expect(runtime?.runner.isRunning()).toBe(false)
  })
})
