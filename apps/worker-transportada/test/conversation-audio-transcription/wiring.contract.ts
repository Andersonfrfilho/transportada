/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.4: o registro da rotina (só com modelo configurado), o desligamento e o catálogo.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { isAudioTranscriptionConfigured } from '../../src/conversation-audio-transcription/audio-transcription-configured.policy.js'
import { buildAudioTranscriptionRuntime } from '../../src/conversation-audio-transcription/build-audio-transcription-runtime.js'
import { CONVERSATION_AUDIO_TRANSCRIBE_JOB } from '../../src/conversation-audio-transcription/audio-transcription-runtime.constant.js'
import {
  JOB_MINIMUM_INTERVAL_SECONDS,
  JOB_TICK_INTERVAL_SECONDS,
  isJobOutcome,
} from '../../src/shared/job-catalog.constant.js'
import type {
  AudioTranscriptionEnvironment,
  WorkerEnvironment,
} from '../../src/shared/worker.types.js'
import {
  createInstantTranscriber,
  createFixedProbe,
  createLogCapture,
  createMapReader,
} from '../fixtures/audio-transcription-doubles.fixture.js'

const MAIN_SOURCE = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8')

const ENVIRONMENT: AudioTranscriptionEnvironment = {
  batchSize: 2,
  binaryPath: 'whisper-cli',
  language: 'pt',
  maxDurationMilliseconds: 600_000,
  modelPath: '/models/ggml-small-q5_1.bin',
  recoveryWindowHours: 72,
  threads: 2,
  timeoutMilliseconds: 300_000,
}

describe('conversation.audio.transcribe registration (spec 264 T3.4)', () => {
  test('without a model the routine is not configured, so it is not registered', () => {
    expect(isAudioTranscriptionConfigured({} as WorkerEnvironment)).toBe(false)
    expect(
      isAudioTranscriptionConfigured({ audioTranscription: ENVIRONMENT } as WorkerEnvironment),
    ).toBe(true)
  })

  test('main registers it only behind the configured guard', () => {
    expect(MAIN_SOURCE).toMatch(
      /isAudioTranscriptionConfigured\(config\)\s*\?\s*registerAudioTranscriptionRuntime/u,
    )
    expect(MAIN_SOURCE).toMatch(
      /audioTranscriptionRuntime === undefined\s*\?\s*\{\}\s*:\s*\{ \[CONVERSATION_AUDIO_TRANSCRIBE_JOB\]/u,
    )
  })

  test('the runner is the first closeable, ahead of storage, error tracker and logger', () => {
    const closeables = MAIN_SOURCE.slice(MAIN_SOURCE.indexOf('closeables: ['))
    const runnerAt = closeables.indexOf('audioTranscriptionRuntime.runner')
    expect(runnerAt).toBeGreaterThan(-1)
    expect(runnerAt).toBeLessThan(closeables.indexOf('storageGateway,'))
    expect(runnerAt).toBeLessThan(closeables.indexOf('errorTracker.flush'))
  })

  test('a failed boot also closes the runner', () => {
    expect(MAIN_SOURCE).toContain('audioTranscriptionRuntime?.runner.close()')
  })

  test('builds a routine and a runner from the environment with injected engine and probe', () => {
    const runtime = buildAudioTranscriptionRuntime({
      database: {} as never,
      durationProbe: createFixedProbe(1_000),
      environment: ENVIRONMENT,
      logger: createLogCapture().logger,
      objectReader: createMapReader({}),
      speechToText: createInstantTranscriber(),
    })
    expect(typeof runtime.routine.run).toBe('function')
    expect(runtime.runner.isRunning()).toBe(false)
  })

  test('the job runs at the 5 minute tick and knows its three outcomes only', () => {
    expect(JOB_MINIMUM_INTERVAL_SECONDS[CONVERSATION_AUDIO_TRANSCRIBE_JOB]).toBe(
      JOB_TICK_INTERVAL_SECONDS,
    )
    for (const outcome of ['already_running', 'runner_lock_expired', 'succeeded']) {
      expect(isJobOutcome({ job: CONVERSATION_AUDIO_TRANSCRIBE_JOB, outcome })).toBe(true)
    }
    expect(
      isJobOutcome({ job: CONVERSATION_AUDIO_TRANSCRIBE_JOB, outcome: 'decode_timeout' }),
    ).toBe(false)
    expect(isJobOutcome({ job: 'trip.canhoto.read', outcome: 'already_running' })).toBe(false)
  })
})
