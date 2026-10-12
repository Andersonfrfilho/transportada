/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3 (contract.md §5.6, passos 4-8): o que uma linha reivindicada vira, com transcritor,
 * sonda e leitor de objeto falsos. O SQL da posse e das escritas é provado em `test/integration/`.
 */
import { describe, expect, test } from 'bun:test'

import {
  createFixedProbe,
  createInstantTranscriber,
} from '../fixtures/audio-transcription-doubles.fixture.js'
import { MAX_DURATION_MS, processOne } from './line-processing.support.js'

describe('audio transcription line processing (spec 264 T3.3)', () => {
  test('a good audio becomes ready with the text, generated once', async () => {
    const { result, row } = await processOne()
    expect(result.state).toBe('ready')
    expect(row.status).toBe('ready')
    expect(row.text).toContain('motorista')
    expect(row.audioDurationMs).toBe(5_000)
  })

  test('a text with U+0000 is stored without it', async () => {
    const { row } = await processOne({ transcriber: createInstantTranscriber('ola\u0000 mundo') })
    expect(row.text).toBe('ola mundo')
  })

  test('a duration at the ceiling is too long, and the transcriber is never called', async () => {
    const transcriber = createInstantTranscriber()
    const { result, row } = await processOne({
      probe: createFixedProbe(MAX_DURATION_MS),
      transcriber,
    })
    expect(result).toEqual({ code: 'too_long', state: 'failed' })
    expect(row.failureCode).toBe('too_long')
    expect(row.maxDurationMs).toBe(MAX_DURATION_MS)
    expect(transcriber.calls).toBe(0)
  })

  test('one millisecond under the ceiling is still transcribed', async () => {
    const transcriber = createInstantTranscriber()
    const { result } = await processOne({
      probe: createFixedProbe(MAX_DURATION_MS - 1),
      transcriber,
    })
    expect(result.state).toBe('ready')
    expect(transcriber.calls).toBe(1)
  })

  test('a disabled company closes without the engine and outside the alert', async () => {
    const transcriber = createInstantTranscriber()
    const { logs, result, row } = await processOne({
      row: { isCompanyEnabled: false },
      transcriber,
    })
    expect(result).toEqual({ code: 'company_disabled', state: 'company_disabled' })
    expect(row.failureCode).toBe('company_disabled')
    expect(transcriber.calls).toBe(0)
    expect(logs.lines.filter((line) => line.level === 'error')).toHaveLength(0)
  })

  test('a different sha256 is a definitive sha256_mismatch', async () => {
    const { result, row } = await processOne({ row: { sha256: 'f'.repeat(64) } })
    expect(result).toEqual({ code: 'sha256_mismatch', state: 'failed' })
    expect(row.status).toBe('failed')
  })

  test('a missing object is object_missing', async () => {
    const { result } = await processOne({ objects: {} })
    expect(result).toEqual({ code: 'object_missing', state: 'failed' })
  })

  test('a deleted object is purged: ready without text, no download and no engine', async () => {
    const transcriber = createInstantTranscriber()
    const { result, row } = await processOne({
      objects: {},
      row: { objectStatus: 'deleted' },
      transcriber,
    })
    expect(result.state).toBe('purged')
    expect(row.status).toBe('ready')
    expect(row.text).toBeNull()
    expect(transcriber.calls).toBe(0)
  })
})
