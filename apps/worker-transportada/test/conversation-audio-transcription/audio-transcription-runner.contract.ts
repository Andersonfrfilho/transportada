/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T3.3 (contract §5.8): o executor em processo — uma execução por vez, fora do ciclo
 * serial do job-run, com contadores entregues ao ciclo seguinte e soltura graciosa no desligamento.
 */
import { describe, expect, test } from 'bun:test'

import type { ClaimedTranscription } from '../../src/conversation-audio-transcription/application/audio-transcription-queue.port.js'
import { createAudioTranscriptionRunner } from '../../src/conversation-audio-transcription/application/audio-transcription.runner.js'
import type {
  AudioRowOutcome,
  AudioRowProcessorPort,
} from '../../src/conversation-audio-transcription/application/audio-row-processor.js'
import { buildFakeRow, createFakeQueue } from '../fixtures/audio-transcription-queue.fixture.js'

const LEASE_MS = 600_000
let clock = new Date('2026-10-12T12:00:00.000Z')
const now = (): Date => clock

type Gate = { readonly promise: Promise<void>; release(): void }
function createGate(): Gate {
  let release = (): void => undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

type Log = { readonly level: string; readonly message: string; readonly metadata: unknown }

function build(params: {
  readonly batchSize?: number
  readonly rows?: number
  readonly process: (claimed: ClaimedTranscription, signal: AbortSignal) => Promise<AudioRowOutcome>
}) {
  clock = new Date('2026-10-12T12:00:00.000Z')
  const rows = Array.from({ length: params.rows ?? 3 }, (_, index) =>
    buildFakeRow({ nextAttemptAt: new Date(clock.getTime() - 1_000 * (10 - index)) }),
  )
  const queue = createFakeQueue({ now, rows })
  const logs: Log[] = []
  const processor: AudioRowProcessorPort = {
    process: ({ claimed, signal }) => params.process(claimed, signal),
  }
  const runner = createAudioTranscriptionRunner({
    batchSize: params.batchSize ?? 2,
    leaseMs: LEASE_MS,
    logger: {
      error: (message, metadata) => logs.push({ level: 'error', message, metadata }),
      info: (message, metadata) => logs.push({ level: 'info', message, metadata }),
      warn: (message, metadata) => logs.push({ level: 'warn', message, metadata }),
    },
    now,
    processor,
    queue,
  })
  return { logs, queue, rows, runner }
}

describe('executor em processo da transcrição (spec 264 T3.3, contract §5.8)', () => {
  test('start devolve na hora, antes de a transcrição terminar', async () => {
    const gate = createGate()
    const harness = build({ process: async () => (await gate.promise, 'ready') })
    expect(harness.runner.start()).toBe('started')
    // o transcritor falso está preso e mesmo assim chegamos aqui: o ciclo não espera por ele
    expect(harness.rows.some((row) => row.leaseToken !== null)).toBe(false)
    gate.release()
    await harness.runner.whenIdle()
  })

  test('um segundo ciclo com a execução ocupada devolve already_running e não abre outra', async () => {
    const gate = createGate()
    let concurrent = 0
    let peak = 0
    const harness = build({
      process: async () => {
        concurrent += 1
        peak = Math.max(peak, concurrent)
        await gate.promise
        concurrent -= 1
        return 'ready'
      },
    })
    expect(harness.runner.start()).toBe('started')
    await Bun.sleep(5)
    expect(harness.runner.start()).toBe('already_running')
    gate.release()
    await harness.runner.whenIdle()
    expect(peak).toBe(1)
  })

  test('processa uma linha por vez até o lote (BATCH_SIZE) e deixa o resto para a próxima execução', async () => {
    const seen: string[] = []
    const harness = build({
      batchSize: 2,
      process: async (claimed) => {
        seen.push(claimed.id)
        return 'ready'
      },
    })
    harness.runner.start()
    await harness.runner.whenIdle()
    expect(seen).toHaveLength(2)
    expect(harness.runner.takeSummary()).toEqual({
      failed: 0,
      processed: 2,
      ready: 2,
      runnerError: 0,
    })
  })

  test('takeSummary entrega o resumo da execução que terminou e zera', async () => {
    const outcomes: AudioRowOutcome[] = ['ready', 'failed', 'retry']
    let index = 0
    const harness = build({
      batchSize: 3,
      process: async () => outcomes[index++] ?? 'ready',
    })
    harness.runner.start()
    await harness.runner.whenIdle()
    expect(harness.runner.takeSummary()).toEqual({
      failed: 1,
      processed: 3,
      ready: 1,
      runnerError: 0,
    })
    expect(harness.runner.takeSummary()).toEqual({
      failed: 0,
      processed: 0,
      ready: 0,
      runnerError: 0,
    })
  })

  test('erro lançado pelo processador não vira rejeição solta: encerra a execução com runnerError = 1', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown): void => void unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const harness = build({
        process: async () => {
          throw new Error('Joao da Silva CPF 123.456.789-09 caiu o banco')
        },
      })
      harness.runner.start()
      await harness.runner.whenIdle()
      await Bun.sleep(5)
      expect(harness.runner.takeSummary().runnerError).toBe(1)
      expect(unhandled).toHaveLength(0)
      expect(JSON.stringify(harness.logs)).not.toContain('Joao da Silva')
      expect(harness.logs.some((line) => line.level === 'error')).toBe(true)
      expect(harness.runner.start()).toBe('started')
      await harness.runner.whenIdle()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  test('trava mais velha que BATCH_SIZE × LEASE: runner_lock_expired, log de erro e a trava é solta', async () => {
    const gate = createGate()
    const harness = build({ batchSize: 2, process: async () => (await gate.promise, 'ready') })
    harness.runner.start()
    await Bun.sleep(5)
    clock = new Date(clock.getTime() + 2 * LEASE_MS + 1)
    expect(harness.runner.start()).toBe('runner_lock_expired')
    expect(
      harness.logs.some(
        (line) =>
          line.level === 'error' && line.message === 'audio_transcription_runner_lock_expired',
      ),
    ).toBe(true)
    expect(harness.runner.start()).toBe('started')
    gate.release()
    await harness.runner.whenIdle()
  })

  test('close() aborta a execução e a linha em posse volta a pending com a tentativa devolvida', async () => {
    const harness = build({
      batchSize: 1,
      rows: 1,
      process: async (claimed, signal) => {
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()))
        await harness.queue.release({ id: claimed.id, leaseToken: claimed.leaseToken })
        return 'released'
      },
    })
    harness.runner.start()
    await Bun.sleep(5)
    expect(harness.rows[0]?.attempts).toBe(1)
    await harness.runner.close()
    expect(harness.rows[0]?.attempts).toBe(0)
    expect(harness.rows[0]?.status).toBe('pending')
    expect(harness.runner.start()).toBe('closed')
  })

  test('depois do close nada mais é reivindicado', async () => {
    const harness = build({ process: async () => 'ready' })
    await harness.runner.close()
    harness.runner.start()
    await harness.runner.whenIdle()
    expect(harness.queue.calls.filter((call) => call === 'claimNext')).toHaveLength(0)
  })

  test('o expurgo de ready com objeto apagado roda dentro da execução', async () => {
    const harness = build({ process: async () => 'ready' })
    harness.runner.start()
    await harness.runner.whenIdle()
    expect(harness.queue.calls).toContain('purgeDeletedObjects')
  })
})
