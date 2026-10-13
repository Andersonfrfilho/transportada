/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3 (contract.md §5.8): o ciclo de vida do executor (desligamento, corrida de posse, trava vencida).
 */
import { describe, expect, test } from 'bun:test'

import { AUDIO_TRANSCRIPTION_RUNNER_START } from '../../src/conversation-audio-transcription/audio-transcription.runner.js'
import { flushMicrotasks } from '../fixtures/audio-transcription-doubles.fixture.js'
import { buildFakeRow } from '../fixtures/audio-transcription-harness.fixture.js'

import { LOCK_MAX_AGE_MS, buildRunner } from './runner.support.js'

describe('audio transcription runner lifecycle (spec 264 T3.3 + review)', () => {
  test('close() returns the in-flight line to pending with the attempt given back', async () => {
    const rows = [buildFakeRow()]
    const { runner, transcriber } = buildRunner({ rows })
    runner.start()
    await flushMicrotasks()
    expect(rows[0]?.attempts).toBe(1)
    await runner.close()
    expect(rows[0]).toMatchObject({ attempts: 0, leaseToken: '', status: 'pending' })
    expect(transcriber.signals[0]?.aborted).toBe(true)
    await flushMicrotasks()
    expect(rows[0]).toMatchObject({ attempts: 0, status: 'pending' })
    expect(runner.start()).toBe(AUDIO_TRANSCRIPTION_RUNNER_START.ALREADY_RUNNING)
  })

  test('close() without an execution is a no-op', async () => {
    const { runner } = buildRunner({ rows: [] })
    await runner.close()
    expect(runner.isRunning()).toBe(false)
  })

  test('two executions racing for the same line: only the one holding the lease token writes', async () => {
    const rows = [buildFakeRow()]
    const { baseQueue, clock } = buildRunner({ rows })
    const first = await baseQueue.claimNext({ leaseMilliseconds: 1_000 })
    expect(await baseQueue.claimNext({ leaseMilliseconds: 1_000 })).toBeUndefined()
    clock.advance(1_001)
    const second = await baseQueue.claimNext({ leaseMilliseconds: 1_000 })
    expect(second?.attempts).toBe(2)
    const params = {
      audioDurationMs: 1,
      engine: 'e',
      language: 'pt',
      model: 'm',
      processingMs: 1,
      text: 'x',
    }
    expect(
      await baseQueue.markReady({
        ...params,
        id: 'transcription-1',
        leaseToken: first?.leaseToken ?? '',
      }),
    ).toBe(false)
    expect(
      await baseQueue.markReady({
        ...params,
        id: 'transcription-1',
        leaseToken: second?.leaseToken ?? '',
      }),
    ).toBe(true)
  })

  test('close() while the claim is still in flight releases the line that claim returns (L2)', async () => {
    const rows = [buildFakeRow()]
    let releaseClaim: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (releaseClaim = resolve))
    const { runner } = buildRunner({
      rows,
      wrapQueue: (queue) => ({
        ...queue,
        claimNext: async (params) => {
          await gate
          return queue.claimNext(params)
        },
        release: async (key) => {
          await new Promise((resolve) => setTimeout(resolve, 15))
          return queue.release(key)
        },
      }),
    })
    runner.start()
    await flushMicrotasks()
    const closing = runner.close()
    releaseClaim()
    await closing
    // sem flush: o close() só volta depois de a linha ter sido solta
    expect(rows[0]).toMatchObject({ attempts: 0, leaseToken: '', status: 'pending' })
  })

  test('an execution that outlived its lock still hands its summary over, summed with the new one (L1)', async () => {
    const { clock, runner, transcriber } = buildRunner({
      rows: [buildFakeRow(), buildFakeRow({ id: 'two' })],
    })
    runner.start()
    await flushMicrotasks()
    clock.advance(LOCK_MAX_AGE_MS + 1)
    expect(runner.start()).toBe('runner_lock_expired')
    await flushMicrotasks()
    expect(runner.start()).toBe('started')
    await flushMicrotasks()
    transcriber.finish()
    await flushMicrotasks()
    expect(runner.takeSummary()).toMatchObject({ runnerError: 0 })
  })
})
