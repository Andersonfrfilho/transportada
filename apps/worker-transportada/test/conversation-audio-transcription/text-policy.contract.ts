/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { AUDIO_TRANSCRIPTION_MAX_ATTEMPTS } from '../../src/conversation-audio-transcription/audio-transcription-runtime.constant.js'
import {
  computeLeaseMilliseconds,
  computeRunnerLockMaxAgeMilliseconds,
  hasExhaustedAttempts,
  resolveRetryDelayMilliseconds,
} from '../../src/conversation-audio-transcription/audio-transcription-retry.policy.js'
import {
  normalizeTranscriptionText,
  resolveModelName,
} from '../../src/conversation-audio-transcription/audio-transcription-text.policy.js'
import { AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS } from '../../src/shared/conversation-audio-transcription.constant.js'

describe('transcription text policy (spec 264 T3.3)', () => {
  test('removes U+0000 because the Postgres text column refuses it', () => {
    expect(normalizeTranscriptionText('ola\u0000 mundo\u0000')).toBe('ola mundo')
  })

  test('keeps empty text: silence is a result, not an error', () => {
    expect(normalizeTranscriptionText('')).toBe('')
  })

  test('cuts at 20000 code points, not UTF-16 units, so emoji never overflow the CHECK', () => {
    const emoji = '\u{1F600}'.repeat(AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS + 50)
    const cut = normalizeTranscriptionText(emoji)
    expect(Array.from(cut)).toHaveLength(AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS)
    expect(cut.length).toBe(AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS * 2)
  })

  test('cuts on a word boundary when there is one', () => {
    const words = `${'palavra '.repeat(AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS)}`
    const cut = normalizeTranscriptionText(words)
    expect(Array.from(cut).length).toBeLessThanOrEqual(AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS)
    expect(cut.endsWith('palavra')).toBe(true)
  })

  test('leaves text at the limit untouched', () => {
    const exact = 'a'.repeat(AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS)
    expect(normalizeTranscriptionText(exact)).toBe(exact)
  })

  test('derives the model name from the file the operator configured', () => {
    expect(resolveModelName('/models/ggml-small-q5_1.bin')).toBe('small-q5_1')
    expect(resolveModelName('/models/' + 'x'.repeat(100) + '.bin')).toHaveLength(64)
  })
})

describe('transcription retry and lease policy (spec 264 T3.3)', () => {
  test('backs off 1, 5 and 30 minutes by attempt, and exhausts at the third', () => {
    expect(resolveRetryDelayMilliseconds(1)).toBe(60_000)
    expect(resolveRetryDelayMilliseconds(2)).toBe(300_000)
    expect(resolveRetryDelayMilliseconds(3)).toBe(1_800_000)
    expect(AUDIO_TRANSCRIPTION_MAX_ATTEMPTS).toBe(3)
    expect(hasExhaustedAttempts(2)).toBe(false)
    expect(hasExhaustedAttempts(3)).toBe(true)
  })

  test('the lease covers 2 x engine + ffprobe + decode + download + margin', () => {
    expect(computeLeaseMilliseconds(300_000)).toBe(2 * 300_000 + 15_000 + 60_000 + 60_000 + 60_000)
  })

  test('the runner lock lives batch size times one lease', () => {
    expect(computeRunnerLockMaxAgeMilliseconds({ batchSize: 2, leaseMilliseconds: 495_000 })).toBe(
      990_000,
    )
  })
})
