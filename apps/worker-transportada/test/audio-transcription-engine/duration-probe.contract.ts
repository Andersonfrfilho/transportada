/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createFfprobeAudioDurationProbe } from '../../src/conversation-audio-transcription/ffprobe-audio-duration-probe.gateway.js'
import {
  runCommandWithTimeout,
  type CommandOutcome,
  type RunCommand,
  type RunCommandParams,
} from '../../src/conversation-audio-transcription/run-command-with-timeout.js'

const AUDIO = Buffer.from([1, 2, 3])
const MAX_DURATION_MS = 600_000

function exited(stdout: string, exitCode = 0): CommandOutcome {
  return { exitCode, outcome: 'exited', stdout }
}

function scriptedRunner(outcomes: readonly CommandOutcome[]) {
  const calls: RunCommandParams[] = []
  const runCommand: RunCommand = async (params) => {
    calls.push(params)
    const outcome = outcomes[calls.length - 1]
    if (outcome === undefined) throw new Error('unexpected extra command')
    return outcome
  }
  return { calls, runCommand }
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error)
}

describe('ffprobe audio duration probe (spec 264 T3.2)', () => {
  test('the header duration comes back in milliseconds with the 15 s probe timeout', async () => {
    const { calls, runCommand } = scriptedRunner([exited('12.345000\n')])
    const probe = createFfprobeAudioDurationProbe({ runCommand })
    expect(await probe.measure({ audio: AUDIO, maxDurationMilliseconds: MAX_DURATION_MS })).toBe(
      12_345,
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe('ffprobe')
    expect(calls[0]?.timeoutMilliseconds).toBe(15_000)
  })

  test('without a header duration it decodes with a cap of the ceiling plus one second', async () => {
    const { calls, runCommand } = scriptedRunner([
      exited('N/A\n'),
      exited('out_time_us=N/A\nout_time_us=2000000\nout_time_us=7500000\nprogress=end\n'),
    ])
    const probe = createFfprobeAudioDurationProbe({ runCommand })
    expect(await probe.measure({ audio: AUDIO, maxDurationMilliseconds: MAX_DURATION_MS })).toBe(
      7_500,
    )
    expect(calls).toHaveLength(2)
    expect(calls[1]?.command).toBe('ffmpeg')
    expect(calls[1]?.timeoutMilliseconds).toBe(60_000)
    const args = calls[1]?.args ?? []
    expect(args[args.indexOf('-t') + 1]).toBe('601')
  })

  test('a long file decoded up to the cap reads at or above the ceiling', async () => {
    const { runCommand } = scriptedRunner([exited(''), exited('out_time_us=601000000\n')])
    const probe = createFfprobeAudioDurationProbe({ runCommand })
    const duration = await probe.measure({ audio: AUDIO, maxDurationMilliseconds: MAX_DURATION_MS })
    expect(duration).toBeGreaterThanOrEqual(MAX_DURATION_MS)
  })

  test('probe timeout is retriable engine_timeout and never decodes', async () => {
    const { calls, runCommand } = scriptedRunner([{ outcome: 'timed_out' }])
    const probe = createFfprobeAudioDurationProbe({ runCommand })
    const failure = await failureOf(
      probe.measure({ audio: AUDIO, maxDurationMilliseconds: MAX_DURATION_MS }),
    )
    expect(failure).toMatchObject({ code: 'engine_timeout', kind: 'retriable' })
    expect(calls).toHaveLength(1)
  })

  test('decode timeout is retriable engine_timeout', async () => {
    const { runCommand } = scriptedRunner([exited('N/A'), { outcome: 'timed_out' }])
    const probe = createFfprobeAudioDurationProbe({ runCommand })
    const failure = await failureOf(
      probe.measure({ audio: AUDIO, maxDurationMilliseconds: MAX_DURATION_MS }),
    )
    expect(failure).toMatchObject({ code: 'engine_timeout', kind: 'retriable' })
  })

  test('a file the probe refuses is a definitive unsupported_format', async () => {
    const { runCommand } = scriptedRunner([exited('', 1)])
    const probe = createFfprobeAudioDurationProbe({ runCommand })
    const failure = await failureOf(
      probe.measure({ audio: AUDIO, maxDurationMilliseconds: MAX_DURATION_MS }),
    )
    expect(failure).toMatchObject({ code: 'unsupported_format', kind: 'definitive' })
  })

  test('garbage output from the decode is a definitive engine_failed', async () => {
    const { runCommand } = scriptedRunner([exited('garbage'), exited('lixo sem tempo\n')])
    const probe = createFfprobeAudioDurationProbe({ runCommand })
    const failure = await failureOf(
      probe.measure({ audio: AUDIO, maxDurationMilliseconds: MAX_DURATION_MS }),
    )
    expect(failure).toMatchObject({ code: 'engine_failed', kind: 'definitive' })
  })

  test('a missing binary is a definitive engine_failed', async () => {
    const { runCommand } = scriptedRunner([{ outcome: 'spawn_failed' }])
    const probe = createFfprobeAudioDurationProbe({ runCommand })
    const failure = await failureOf(
      probe.measure({ audio: AUDIO, maxDurationMilliseconds: MAX_DURATION_MS }),
    )
    expect(failure).toMatchObject({ code: 'engine_failed', kind: 'definitive' })
  })

  test('the real runner kills a child that outlives the timeout', async () => {
    const outcome = await runCommandWithTimeout({
      args: ['5'],
      command: 'sleep',
      timeoutMilliseconds: 100,
    })
    expect(outcome).toEqual({ outcome: 'timed_out' })
  })

  test('the real runner reports a missing binary and a clean exit', async () => {
    expect(
      await runCommandWithTimeout({
        args: [],
        command: '/nonexistent/binary',
        timeoutMilliseconds: 1_000,
      }),
    ).toEqual({ outcome: 'spawn_failed' })
    expect(
      await runCommandWithTimeout({ args: ['ok'], command: 'echo', timeoutMilliseconds: 5_000 }),
    ).toEqual({ exitCode: 0, outcome: 'exited', stdout: 'ok\n' })
  })
})
