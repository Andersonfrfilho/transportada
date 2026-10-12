/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3 e a revisão da T3.4: o que uma linha vira quando algo falha — tentar de novo com backoff,
 * esgotar, falha de ambiente que não gasta tentativa, erro do storage, empresa desligada no meio e o
 * desligamento do worker.
 */
import { describe, expect, test } from 'bun:test'

import { SPEECH_TO_TEXT_FAILURE_KIND } from '../../src/conversation-audio-transcription/audio-transcription-engine.constant.js'
import { SpeechToTextError } from '../../src/conversation-audio-transcription/speech-to-text.error.js'
import {
  createFixedProbe,
  createInstantTranscriber,
  createThrowingReader,
} from '../fixtures/audio-transcription-doubles.fixture.js'
import { failing, MINUTE, processOne } from './line-processing.support.js'

const retriable = (code: 'engine_timeout' | 'engine_failed') =>
  new SpeechToTextError({ code, kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE })

describe('audio transcription line failures (spec 264 T3.3 + review)', () => {
  test('a retriable engine failure goes back to pending with the 1 minute backoff', async () => {
    const error = new SpeechToTextError({
      code: 'engine_timeout',
      kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
    })
    const { clock, result, row } = await processOne({ transcriber: failing(error) })
    expect(result.state).toBe('retried')
    expect(row.status).toBe('pending')
    expect(row.attempts).toBe(1)
    expect(row.nextAttemptAtMs).toBe(clock.now().getTime() + MINUTE)
  })

  test('the second failure waits 5 minutes and the third exhausts the attempts', async () => {
    const error = new SpeechToTextError({
      code: 'engine_failed',
      kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
    })
    const second = await processOne({ row: { attempts: 1 }, transcriber: failing(error) })
    expect(second.row.nextAttemptAtMs).toBe(second.clock.now().getTime() + 5 * MINUTE)
    const third = await processOne({ row: { attempts: 2 }, transcriber: failing(error) })
    expect(third.result).toEqual({ code: 'attempts_exhausted', state: 'failed' })
    expect(third.row.failureCode).toBe('attempts_exhausted')
  })

  test('a definitive failure closes with its own code, without retrying', async () => {
    const error = new SpeechToTextError({
      code: 'unsupported_format',
      kind: SPEECH_TO_TEXT_FAILURE_KIND.DEFINITIVE,
    })
    const { result, row } = await processOne({ transcriber: failing(error) })
    expect(result).toEqual({ code: 'unsupported_format', state: 'failed' })
    expect(row.status).toBe('failed')
  })

  test('an ffprobe or ffmpeg timeout is retriable and counts the attempt', async () => {
    const timeout = new SpeechToTextError({
      code: 'engine_timeout',
      kind: SPEECH_TO_TEXT_FAILURE_KIND.RETRIABLE,
    })
    const { result, row } = await processOne({ probe: createFixedProbe(timeout) })
    expect(result.state).toBe('retried')
    expect(row.attempts).toBe(1)
  })

  test('an unknown error is retriable too, and the third one still exhausts', async () => {
    const { result } = await processOne({
      row: { attempts: 2 },
      transcriber: failing(new Error('boom')),
    })
    expect(result).toEqual({ code: 'attempts_exhausted', state: 'failed' })
  })

  test('a result written by someone who lost the lease is discarded', async () => {
    const { result, row } = await processOne({ shouldStealLease: true })
    expect(result.state).toBe('ownership_lost')
    expect(row.status).toBe('pending')
    expect(row.text).toBeUndefined()
  })

  test('a storage transport error keeps the line pending with the backoff, never object_missing', async () => {
    const { clock, result, row } = await processOne({
      reader: createThrowingReader(retriable('engine_failed')),
    })
    expect(result.state).toBe('retried')
    expect(row).toMatchObject({ attempts: 1, status: 'pending', failureCode: undefined })
    expect(row.nextAttemptAtMs).toBe(clock.now().getTime() + MINUTE)
  })

  test('a missing binary is infrastructure: pending 30 minutes ahead and the attempt is given back', async () => {
    const infrastructure = new SpeechToTextError({
      code: 'engine_failed',
      kind: SPEECH_TO_TEXT_FAILURE_KIND.INFRASTRUCTURE,
    })
    const { clock, logs, result, row } = await processOne({
      row: { attempts: 2 },
      transcriber: failing(infrastructure),
    })
    expect(result.state).toBe('infrastructure')
    expect(row).toMatchObject({ attempts: 2, status: 'pending' })
    expect(row.nextAttemptAtMs).toBe(clock.now().getTime() + 30 * MINUTE)
    expect(logs.lines.some((line) => line.level === 'error')).toBe(true)
  })

  test('the measured duration is kept even when the engine fails afterwards', async () => {
    const { row } = await processOne({
      probe: createFixedProbe(7_000),
      transcriber: failing(retriable('engine_timeout')),
    })
    expect(row.audioDurationMs).toBe(7_000)
  })

  test('a company switched off during the transcription never gets the text stored', async () => {
    const { result, row } = await processOne({ row: { isCompanyDisabledNow: true } })
    expect(result).toEqual({ code: 'company_disabled', state: 'company_disabled' })
    expect(row).toMatchObject({ failureCode: 'company_disabled', status: 'failed', text: null })
  })

  test('an object with no stored_objects row is object_missing', async () => {
    const { result } = await processOne({ row: { objectStatus: 'missing' } })
    expect(result).toEqual({ code: 'object_missing', state: 'failed' })
  })

  test('an aborted worker writes nothing: the close() releases the line instead', async () => {
    const controller = new AbortController()
    controller.abort()
    const transcriber = createInstantTranscriber()
    const { result, row } = await processOne({ signal: controller.signal, transcriber })
    expect(result.state).toBe('released')
    expect(row).toMatchObject({ attempts: 1, status: 'pending', text: undefined })
  })
})
