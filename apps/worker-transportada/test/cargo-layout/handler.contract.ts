/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { ResolvedCargoLayout } from '@adatechnology/cargo-placement'

import { CARGO_LAYOUT_ERROR } from '../../src/cargo-layout/application/cargo-layout-error.constant.js'
import {
  handleCargoLayout,
  type CargoLayoutHandlerPorts,
} from '../../src/cargo-layout/application/cargo-layout-handler.service.js'
import { resolveCargoLayoutLeaseMs } from '../../src/cargo-layout/application/cargo-layout-budget.policy.js'
import { CargoLayoutTimeoutError } from '../../src/cargo-layout/application/cargo-layout-timeout.error.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'
import { buildStoredCargoLayoutInput } from '../fixtures/cargo-layout-input.fixture.js'

const JOB = {
  companyId: '00000000-0000-4000-8000-000000000001',
  correlationId: 'correlation-1',
  inputHash: 'a'.repeat(64),
  layoutId: '00000000-0000-4000-8000-000000000002',
} as const

const BASE_BUDGET_MS = 120_000
const MAX_ATTEMPTS = 3
const STARTED_AT = new Date('2026-09-12T12:00:00.000Z')
const FINISHED_AT = new Date('2026-09-12T12:00:01.250Z')

function buildLayout(unplacedReasons: readonly string[] = []): ResolvedCargoLayout {
  return {
    bedHeightM: '1.80',
    bedLengthM: '4.20',
    bedSource: 'measured',
    bedWidthM: '2.10',
    freeDepthM: '1.00',
    loadingAccess: 'rear',
    orderIsBinding: true,
    overflowDepthM: null,
    overflowM3: '0',
    placement: {
      layers: [],
      source: 'measured',
      unplaced: unplacedReasons.map((reason) => ({ count: 2, label: 'NF 1001', reason })),
    },
    rows: [],
  } as unknown as ResolvedCargoLayout
}

type RecordingPorts = CargoLayoutHandlerPorts & {
  readonly budgets: number[]
  readonly completed: {
    readonly computedAt: Date
    readonly durationMs: number
    readonly layout: unknown
  }[]
  readonly failed: string[]
  readonly released: number
}

function buildPorts(overrides: Partial<CargoLayoutHandlerPorts> = {}): RecordingPorts {
  const budgets: number[] = []
  const completed: RecordingPorts['completed'] = []
  const failed: string[] = []
  const clock = [STARTED_AT, FINISHED_AT]
  let released = 0

  const ports = {
    budgets,
    async claim() {
      return { attempt: 1, input: buildStoredCargoLayoutInput({ stopCount: 2 }) }
    },
    async complete(input: {
      readonly computedAt: Date
      readonly durationMs: number
      readonly layout: unknown
    }) {
      completed.push({
        computedAt: input.computedAt,
        durationMs: input.durationMs,
        layout: input.layout,
      })
    },
    completed,
    async compute(input: { readonly budgetMs: number }) {
      budgets.push(input.budgetMs)
      return buildLayout()
    },
    async fail(input: { readonly errorCode: string }) {
      failed.push(input.errorCode)
    },
    failed,
    get released() {
      return released
    },
    now: () => clock.shift() ?? FINISHED_AT,
    async release() {
      released += 1
    },
    ...overrides,
  }

  return ports as unknown as RecordingPorts
}

type LogEntry = { readonly message: string; readonly metadata?: Record<string, unknown> }

function buildLogger(): WorkerLogger & { readonly warnings: LogEntry[] } {
  const warnings: LogEntry[] = []
  return {
    error() {},
    info() {},
    warn(message, metadata) {
      warnings.push(metadata === undefined ? { message } : { message, metadata })
    },
    warnings,
  }
}

function run(ports: CargoLayoutHandlerPorts, attempt = 1, logger: WorkerLogger = buildLogger()) {
  return handleCargoLayout({
    attempt,
    baseBudgetMs: BASE_BUDGET_MS,
    job: JOB,
    logger,
    maxAttempts: MAX_ATTEMPTS,
    ports,
  })
}

describe('handler da planta de carga (spec 145 D9, D13–D15)', () => {
  test('reivindicação nula confirma sem calcular', async () => {
    const ports = buildPorts({ claim: async () => null })

    expect(await run(ports)).toBe('ack')
    expect(ports.budgets).toEqual([])
    expect(ports.completed).toEqual([])
    expect(ports.failed).toEqual([])
  })

  test('sucesso grava a planta com duração e carimbo, e confirma', async () => {
    const ports = buildPorts()

    expect(await run(ports)).toBe('ack')
    expect(ports.completed).toEqual([
      { computedAt: FINISHED_AT, durationMs: 1_250, layout: buildLayout() },
    ])
    expect(ports.failed).toEqual([])
    expect(ports.released).toBe(0)
  })

  /**
   * Spec 148 T4: a passada final marca a caixa por cima de entrega anterior (`overEarlierDelivery` +
   * `coversStops`) e o `unplaced` vem por nota (`documentId`). O worker grava a planta como veio.
   */
  test('grava a caixa por cima de entrega anterior e o unplaced por nota como vieram', async () => {
    const base = buildLayout()
    const layout = {
      ...base,
      placement: {
        layers: [
          {
            boxes: [
              {
                coversStops: [1, 2],
                documentId: 'doc-7',
                reasons: ['needsRehandling', 'overEarlierDelivery'],
                stopSequence: 3,
              },
            ],
            heightM: 0.5,
            index: 0,
          },
        ],
        source: 'measured',
        unplaced: [{ count: 2, documentId: 'doc-9', label: 'NF 1001', reason: 'bedFull' }],
      },
    } as unknown as ResolvedCargoLayout
    const ports = buildPorts({ compute: async () => layout })

    expect(await run(ports, 1)).toBe('ack')
    expect(ports.completed.map((entry) => entry.layout)).toEqual([layout])
  })

  /** D13: a escada dobra o orçamento a cada tentativa — 120 s, 240 s, 480 s. */
  test.each([
    [1, 120_000],
    [2, 240_000],
    [3, 480_000],
  ])('tentativa %i calcula com orçamento de %i ms', async (attempt, budgetMs) => {
    const ports = buildPorts()

    await run(ports, attempt)

    expect(ports.budgets).toEqual([budgetMs])
  })

  test('caixa cortada pelo orçamento numa tentativa não final devolve à fila e repete', async () => {
    const ports = buildPorts({ compute: async () => buildLayout(['time_budget']) })

    expect(await run(ports, 1)).toBe('retry')
    expect(ports.released).toBe(1)
    expect(ports.completed).toEqual([])
    expect(ports.failed).toEqual([])
  })

  test('na última tentativa a planta cortada é gravada como está', async () => {
    const layout = buildLayout(['time_budget', 'bedFull'])
    const ports = buildPorts({ compute: async () => layout })

    expect(await run(ports, 3)).toBe('ack')
    expect(ports.completed.map((entry) => entry.layout)).toEqual([layout])
    expect(ports.released).toBe(0)
  })

  test('caixa fora por outro motivo não pede nova tentativa', async () => {
    const ports = buildPorts({ compute: async () => buildLayout(['bedFull']) })

    expect(await run(ports, 1)).toBe('ack')
    expect(ports.completed).toHaveLength(1)
  })

  /** D15: capacidade desconhecida não é falha passageira, e `ready` sem planta o CHECK proíbe. */
  test('planta indisponível grava falha UNAVAILABLE e confirma, sem repetir', async () => {
    const ports = buildPorts({ compute: async () => null })

    expect(await run(ports, 1)).toBe('ack')
    expect(ports.failed).toEqual([CARGO_LAYOUT_ERROR.unavailable])
    expect(ports.completed).toEqual([])
    expect(ports.released).toBe(0)
  })

  test('teto externo da thread numa tentativa não final devolve à fila e repete', async () => {
    const ports = buildPorts({
      compute: async () => {
        throw new CargoLayoutTimeoutError()
      },
    })

    expect(await run(ports, 2)).toBe('retry')
    expect(ports.released).toBe(1)
    expect(ports.failed).toEqual([])
  })

  test('teto externo na última tentativa grava TIME_BUDGET_EXCEEDED', async () => {
    const ports = buildPorts({
      compute: async () => {
        throw new CargoLayoutTimeoutError()
      },
    })

    expect(await run(ports, 3)).toBe('ack')
    expect(ports.failed).toEqual([CARGO_LAYOUT_ERROR.timeBudgetExceeded])
  })

  test('exceção ou thread morta grava FAILED e confirma já na primeira tentativa', async () => {
    const ports = buildPorts({
      compute: async () => {
        throw new Error('extraction worker exited with 1')
      },
    })

    expect(await run(ports, 1)).toBe('ack')
    expect(ports.failed).toEqual([CARGO_LAYOUT_ERROR.failed])
    expect(ports.released).toBe(0)
  })

  test('falha transitória do banco ao gravar devolve à fila e repete', async () => {
    const ports = buildPorts({
      complete: async () => {
        throw new Error('connection terminated')
      },
    })

    expect(await run(ports, 1)).toBe('retry')
    expect(ports.released).toBe(1)
    expect(ports.failed).toEqual([])
  })

  /** Revisão final (L6): a causa não some — só o nome dela e o id opaco, nunca a mensagem (PII). */
  test('falha ao gravar registra warn com o nome da causa e o layoutId', async () => {
    const logger = buildLogger()
    const ports = buildPorts({
      complete: async () => {
        throw new TypeError('connection terminated for Cliente 1')
      },
    })

    await run(ports, 1, logger)

    expect(logger.warnings).toEqual([
      {
        message: 'cargo_layout_settle_failed',
        metadata: { layoutId: JOB.layoutId, reason: 'TypeError' },
      },
    ])
  })

  test('falha transitória do banco na última tentativa grava FAILED', async () => {
    const ports = buildPorts({
      complete: async () => {
        throw new Error('connection terminated')
      },
    })

    expect(await run(ports, 3)).toBe('ack')
    expect(ports.failed).toEqual([CARGO_LAYOUT_ERROR.failed])
    expect(ports.released).toBe(0)
  })

  test('entrada inválida na coluna grava FAILED sem calcular e sem repetir', async () => {
    const ports = buildPorts({
      claim: async () => ({ attempt: 1, input: { stops: 'não é lista' } }),
    })

    expect(await run(ports, 1)).toBe('ack')
    expect(ports.failed).toEqual([CARGO_LAYOUT_ERROR.failed])
    expect(ports.budgets).toEqual([])
    expect(ports.released).toBe(0)
  })

  /** D14: o maior orçamento (480 s) + teto externo (10 s) + folga (30 s). */
  test('lease do running órfão é derivado do orçamento base', () => {
    expect(resolveCargoLayoutLeaseMs({ baseBudgetMs: 120_000, maxAttempts: 3 })).toBe(520_000)
    expect(resolveCargoLayoutLeaseMs({ baseBudgetMs: 1_000, maxAttempts: 3 })).toBe(44_000)
  })
})
