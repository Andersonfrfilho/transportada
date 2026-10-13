/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  TranscriptionError,
  TranscriptionRateLimitError,
  TranscriptionUnsupportedError,
} from '@adatechnology/audio-transcription-provider'
import { describe, expect, test } from 'bun:test'

import { classifySpeechToTextError } from '../../src/conversation-audio-transcription/speech-to-text-error.classifier.js'
import { SpeechToTextError } from '../../src/conversation-audio-transcription/speech-to-text.error.js'

const PII_SENTINEL = 'texto-do-cliente-com-pii-123'
const ENGINE = 'whisper-local'

const TIMEOUT_CAUSE = { killed: true, signal: 'SIGTERM' }
const MISSING_BINARY_CAUSE = { code: 'ENOENT' }

const CLASSIFICATION_TABLE = [
  {
    name: 'rate limit',
    error: new TranscriptionRateLimitError(ENGINE, 30, new Error(PII_SENTINEL)),
    expected: { kind: 'retriable', code: 'engine_failed' },
  },
  {
    name: 'unsupported format',
    error: new TranscriptionUnsupportedError(ENGINE, `audio/${PII_SENTINEL}`),
    expected: { kind: 'definitive', code: 'unsupported_format' },
  },
  {
    name: 'retriable engine error killed by the timeout',
    error: new TranscriptionError(PII_SENTINEL, ENGINE, true, TIMEOUT_CAUSE),
    expected: { kind: 'retriable', code: 'engine_timeout' },
  },
  {
    name: 'conversion timeout (package marks it non-retriable)',
    error: new TranscriptionError(PII_SENTINEL, ENGINE, false, TIMEOUT_CAUSE),
    expected: { kind: 'retriable', code: 'engine_timeout' },
  },
  {
    name: 'retriable engine error (dead process, I/O)',
    error: new TranscriptionError(PII_SENTINEL, ENGINE, true, new Error(PII_SENTINEL)),
    expected: { kind: 'retriable', code: 'engine_failed' },
  },
  {
    name: 'infrastructure engine error (missing binary spends no attempt)',
    error: new TranscriptionError(PII_SENTINEL, ENGINE, false, MISSING_BINARY_CAUSE),
    expected: { kind: 'infrastructure', code: 'engine_failed' },
  },
  {
    name: 'unknown error',
    error: new Error(PII_SENTINEL),
    expected: { kind: 'retriable', code: 'engine_failed' },
  },
  {
    name: 'non-error throw',
    error: PII_SENTINEL,
    expected: { kind: 'retriable', code: 'engine_failed' },
  },
  {
    name: 'domain error from the duration probe',
    error: new SpeechToTextError({ kind: 'definitive', code: 'unsupported_format' }),
    expected: { kind: 'definitive', code: 'unsupported_format' },
  },
] as const

describe('speech-to-text error classification (spec 264 T3.2)', () => {
  for (const row of CLASSIFICATION_TABLE) {
    test(`${row.name} => ${row.expected.kind}/${row.expected.code}`, () => {
      expect(classifySpeechToTextError(row.error)).toEqual(row.expected)
    })
  }

  test('the error message never reaches the classification', () => {
    for (const row of CLASSIFICATION_TABLE) {
      expect(JSON.stringify(classifySpeechToTextError(row.error))).not.toContain(PII_SENTINEL)
    }
  })

  test('the domain error carries only the code as message', () => {
    const error = new SpeechToTextError({ kind: 'retriable', code: 'engine_timeout' })
    expect(error.message).toBe('engine_timeout')
    expect(error.kind).toBe('retriable')
  })
})
