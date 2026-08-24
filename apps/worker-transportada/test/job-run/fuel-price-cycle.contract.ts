/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A coleta do preço de referência vista como rotina do relógio. Este arquivo reproduz o que o
 * contrato do cron produzia — os mesmos valores, as mesmas duas metades no mesmo ciclo — e acrescenta
 * o que lá não existia: **o código com que a linha fecha**.
 *
 * No cron a falha de uma metade era uma linha de log e um `failedCount: 1` que virava código de saída
 * 1 do processo. Ninguém olhava. Aqui ela vira palavra do catálogo, e é a tradução que este arquivo
 * prende — porque é a parte da rotina que mais pode mentir ao operador.
 *
 * Duas diferenças em relação ao cron, as duas de propósito:
 *
 * 1. **Não há advisory lock.** A linha de `job_executions`, a unique de execução aberta e o lease já
 *    serializam o ciclo, como em `nfse.status.pull`. Com o lock saíram os dois casos que só falavam
 *    dele.
 * 2. **A fatia vazia da ANEEL passou a ter nome.** No cron `tariffCount: 0` era o padrão do dublê e
 *    não produzia sinal algum: a instalação colhia zero tarifa por semanas e o ciclo dizia sucesso.
 *    É `aneel_empty_slice`, e é por isso que aqui o dublê de energia nasce com série cheia.
 */
import { describe, expect, test } from 'bun:test'

import type {
  FuelReferenceGatewayPort,
  FuelReferenceRecord,
} from '../../src/fuel-price-pull/application/fuel-reference.port.js'
import type { FuelSeriesPort } from '../../src/fuel-price-pull/application/fuel-series.port.js'
import { createFuelPricePullRoutine } from '../../src/fuel-price-pull/application/fuel-price-pull.routine.js'
import type { PullEnergyTariffUseCase } from '../../src/fuel-price-pull/application/pull-energy-tariff.use-case.js'
import { createPullFuelReferenceUseCase } from '../../src/fuel-price-pull/application/pull-fuel-reference.use-case.js'
import {
  classifyAneelFailure,
  classifyAnpFailure,
  FUEL_PRICE_PULL_FAILURE_CAUSES,
  FUEL_PRICE_PULL_FAILURE_OUTCOMES,
  type FuelPricePullFailureCause,
  type FuelPricePullFailureOutcome,
  toFuelPricePullFailureOutcome,
} from '../../src/fuel-price-pull/domain/fuel-price-pull-failure.policy.js'
import { FUEL_PRICE_PULL_JOB } from '../../src/fuel-price-pull/domain/fuel-price-pull.constant.js'
import { parseAnpWeeklyWorkbook } from '../../src/fuel-price-pull/infrastructure/anp-series.client.js'
import type {
  ClaimedJobExecution,
  FinishJobExecutionParams,
  JobExecutionPort,
} from '../../src/job-run/application/job-execution.port.js'
import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import { runJobCycle } from '../../src/job-run/application/run-job-cycle.js'
import type { JobRunEnvelopeV1 } from '../../src/messaging/job-run-envelope.schema.js'
import { isJobOutcome, JOB_FAILURE_OUTCOMES } from '../../src/shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

import { type AnpSheetRow, buildAnpWorkbook } from '../fuel-price-pull/workbook.fixture.js'

import { createLoggerDouble, createManualScheduler, type LoggedMessage } from './job-run.double.js'

const NOW = new Date('2026-08-16T06:00:00.000Z')
const EXECUTION_ID = '7c6d5e4f-3a2b-4c1d-8e9f-0a1b2c3d4e5f'
const CORRELATION_ID = 'tick-2026-08-16T06:00:00.000Z'
const WEEK_ENDING_ON = '2026-08-15'

/**
 * Série cheia é o **padrão** aqui: a metade do kWh que volta vazia é falha nomeada, e deixá-la vazia
 * por descuido do dublê faria todo cenário do litro fechar em `aneel_empty_slice`.
 */
const FULL_TARIFF_SLICE = { discardedRows: 0, tariffCount: 100, writtenCount: 100 } as const

type EnergyResult = {
  readonly discardedRows: number
  readonly tariffCount: number
  readonly writtenCount: number
}

type GatewayDouble = FuelReferenceGatewayPort & {
  calls: number
  readonly written: FuelReferenceRecord[]
}

function createGateway(existing: readonly FuelReferenceRecord[] = []): GatewayDouble {
  const written: FuelReferenceRecord[] = []
  const recorded = {
    calls: 0,
    insertMissing: (input: {
      readonly collectedAt: Date
      readonly references: readonly FuelReferenceRecord[]
    }) => {
      recorded.calls += 1
      const fresh = input.references.filter(
        (reference) =>
          !existing.some(
            (stored) =>
              stored.product === reference.product &&
              stored.state === reference.state &&
              stored.weekEndingOn === reference.weekEndingOn,
          ),
      )
      written.push(...fresh)
      return Promise.resolve({ insertedCount: fresh.length })
    },
    written,
  }
  return recorded
}

function createSeries(rows: readonly AnpSheetRow[]): FuelSeriesPort {
  return {
    fetchWeeklySeries: () =>
      Promise.resolve(parseAnpWeeklyWorkbook({ bytes: buildAnpWorkbook({ rows }) })),
  }
}

function createRejectingSeries(error: unknown): FuelSeriesPort {
  return { fetchWeeklySeries: () => Promise.reject(error) }
}

function createEnergyUseCase(
  result: EnergyResult = FULL_TARIFF_SLICE,
): PullEnergyTariffUseCase & { calls: number } {
  const recorded = {
    calls: 0,
    execute: () => {
      recorded.calls += 1
      return Promise.resolve(result)
    },
  }
  return recorded
}

function createRejectingEnergyUseCase(error: unknown): PullEnergyTariffUseCase & { calls: number } {
  const recorded = {
    calls: 0,
    execute: () => {
      recorded.calls += 1
      return Promise.reject(error)
    },
  }
  return recorded
}

type FixtureParams = {
  readonly energyUseCase?: PullEnergyTariffUseCase
  readonly gateway?: GatewayDouble
  readonly series?: FuelSeriesPort
  readonly stopRequested?: boolean
}

type RoutineFixture = {
  readonly gateway: GatewayDouble
  readonly logged: LoggedMessage[]
  readonly run: () => Promise<{
    readonly counters: Readonly<Record<string, number>>
    readonly outcome: string
  }>
}

function createFixture({
  energyUseCase = createEnergyUseCase(),
  gateway = createGateway(),
  series = createSeries([GNV_ROW]),
  stopRequested = false,
}: FixtureParams = {}): RoutineFixture {
  const logged: LoggedMessage[] = []
  const logger: WorkerLogger = createLoggerDouble(logged)

  const routine = createFuelPricePullRoutine({
    energyUseCase,
    logger,
    now: () => NOW,
    pullUseCase: createPullFuelReferenceUseCase({ gateway, logger, series }),
  })

  const context: JobRoutineContext = {
    correlationId: CORRELATION_ID,
    executionId: EXECUTION_ID,
    isStopRequested: () => stopRequested,
    job: FUEL_PRICE_PULL_JOB,
    origin: 'schedule',
  }

  return { gateway, logged, run: () => routine.run(context) }
}

function dieselRow(input: {
  readonly averagePrice: string
  readonly state: string
  readonly stationCount: number
}): AnpSheetRow {
  return {
    averagePrice: input.averagePrice,
    product: 'OLEO DIESEL S10',
    region: 'SUDESTE',
    state: input.state,
    stationCount: input.stationCount,
    unit: 'R$/l',
  }
}

const GNV_ROW: AnpSheetRow = {
  averagePrice: '4.3899999999999997',
  product: 'GNV',
  region: 'NORDESTE',
  state: 'ALAGOAS',
  stationCount: 13,
  unit: 'R$/m³',
}

const GNV_REFERENCE: FuelReferenceRecord = {
  pricePerUnit: '4.3900',
  product: 'gnv',
  state: 'AL',
  stationCount: 13,
  weekEndingOn: WEEK_ENDING_ON,
}

describe('fuel price pull failure vocabulary', () => {
  test('toda causa interna cai numa palavra do catálogo desta rotina', () => {
    const allowed: readonly string[] = JOB_FAILURE_OUTCOMES[FUEL_PRICE_PULL_JOB]

    for (const cause of FUEL_PRICE_PULL_FAILURE_CAUSES) {
      const outcome = toFuelPricePullFailureOutcome(cause)
      expect(allowed).toContain(outcome)
      expect(isJobOutcome({ job: FUEL_PRICE_PULL_JOB, outcome })).toBe(true)
    }
  })

  test('a tradução das oito causas é esta, e não a semelhança dos nomes', () => {
    const expected: Record<FuelPricePullFailureCause, FuelPricePullFailureOutcome> = {
      // A ANEEL respondeu, e respondeu nada: não é rede, é recorte que ninguém vai consertar sozinho.
      aneel_empty_slice: 'aneel_empty_slice',
      /**
       * Corpo que o schema recusa não tem palavra própria no catálogo, e cair em
       * `aneel_empty_slice` diria que a agência respondeu vazio — ela respondeu outra coisa.
       */
      aneel_malformed_response: 'aneel_unreachable',
      aneel_transport_failure: 'aneel_unreachable',
      aneel_unavailable: 'aneel_unreachable',
      // Planilha que não abre é a única falha desta rotina que nunca se resolve esperando.
      anp_malformed_workbook: 'anp_malformed_workbook',
      anp_transport_failure: 'anp_unreachable',
      anp_unexpected_status: 'anp_unreachable',
      // A semana que a agência ainda não publicou é fato, não falha nossa nem da rede.
      anp_week_unavailable: 'anp_week_not_published',
    }

    for (const cause of FUEL_PRICE_PULL_FAILURE_CAUSES) {
      expect(toFuelPricePullFailureOutcome(cause)).toBe(expected[cause])
    }
  })

  test('a ordem de desempate põe o que uma pessoa resolve antes do que o tempo resolve', () => {
    expect(FUEL_PRICE_PULL_FAILURE_OUTCOMES).toEqual([
      'anp_malformed_workbook',
      'aneel_empty_slice',
      'anp_week_not_published',
      'anp_unreachable',
      'aneel_unreachable',
    ])
  })

  test('todo código que a fatia da ANP lança tem causa, e nenhum vira erro inesperado', () => {
    const expected: Readonly<Record<string, FuelPricePullFailureCause>> = {
      ANP_EMPTY_SHEET: 'anp_malformed_workbook',
      ANP_INVALID_PRICE: 'anp_malformed_workbook',
      ANP_INVALID_SERIAL_DATE: 'anp_malformed_workbook',
      ANP_MALFORMED_ROW: 'anp_malformed_workbook',
      ANP_MALFORMED_WORKBOOK: 'anp_malformed_workbook',
      ANP_MISSING_STATE_SHEET: 'anp_malformed_workbook',
      ANP_UNEXPECTED_HEADER: 'anp_malformed_workbook',
      ANP_UNEXPECTED_STATUS: 'anp_unexpected_status',
      ANP_UNKNOWN_PRODUCT: 'anp_malformed_workbook',
      ANP_UNKNOWN_STATE: 'anp_malformed_workbook',
      ANP_WEEK_UNAVAILABLE: 'anp_week_unavailable',
      FUEL_INVALID_PRICE: 'anp_malformed_workbook',
      XLSX_CORRUPT_DIRECTORY: 'anp_malformed_workbook',
      XLSX_NOT_A_ZIP: 'anp_malformed_workbook',
      XLSX_UNSUPPORTED_COMPRESSION: 'anp_malformed_workbook',
    }

    for (const [code, cause] of Object.entries(expected)) {
      expect(classifyAnpFailure(new Error(code))).toBe(cause)
    }
  })

  test('todo código que a fatia da ANEEL lança tem causa', () => {
    expect(classifyAneelFailure(new Error('ANEEL_TARIFF_UNAVAILABLE'))).toBe('aneel_unavailable')
    expect(classifyAneelFailure(new Error('ANEEL_MALFORMED_RESPONSE'))).toBe(
      'aneel_malformed_response',
    )
    expect(classifyAneelFailure(new Error('ANEEL_INVALID_TARIFF'))).toBe('aneel_malformed_response')
  })

  /**
   * Rede caída chega sem código nosso: `fetch` rejeita `TypeError` e `AbortSignal.timeout` rejeita
   * `TimeoutError`. Sem isto, agência fora do ar viraria `unexpected_error` — defeito nosso.
   */
  test('falha de transporte é reconhecida pelo nome do erro, não por código', () => {
    expect(classifyAnpFailure(new TypeError('fetch failed'))).toBe('anp_transport_failure')
    expect(classifyAneelFailure(new DOMException('timed out', 'TimeoutError'))).toBe(
      'aneel_transport_failure',
    )
    expect(classifyAneelFailure(new DOMException('aborted', 'AbortError'))).toBe(
      'aneel_transport_failure',
    )
  })

  // Erro que não é de nenhuma das duas agências é defeito nosso, e `unexpected_error` é o lugar dele.
  test('erro sem causa conhecida não é traduzido', () => {
    expect(classifyAnpFailure(new RangeError('index out of range'))).toBeUndefined()
    expect(classifyAneelFailure(new Error('boom'))).toBeUndefined()
    expect(classifyAnpFailure('not an error')).toBeUndefined()
  })
})

describe('fuel price pull routine', () => {
  test('uma referência por par, e o kWh no mesmo ciclo', async () => {
    const fixture = createFixture({
      series: createSeries([
        GNV_ROW,
        dieselRow({ averagePrice: '6.89', state: 'SAO PAULO', stationCount: 833 }),
      ]),
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({ eligible: 102, failed: 0, skipped: 0, written: 102 })
    expect(fixture.gateway.written).toEqual([
      GNV_REFERENCE,
      {
        pricePerUnit: '6.8900',
        product: 'diesel-s10',
        state: 'SP',
        stationCount: 833,
        weekEndingOn: WEEK_ENDING_ON,
      },
    ])
  })

  test('repetir a mesma semana não reescreve nada, e o ciclo segue sendo sucesso', async () => {
    const fixture = createFixture({ gateway: createGateway([GNV_REFERENCE]) })

    const result = await fixture.run()

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({ eligible: 101, failed: 0, skipped: 1, written: 100 })
    expect(fixture.gateway.written).toBeEmpty()
  })

  test('agrega por (produto, UF) com o número de postos como peso', async () => {
    const fixture = createFixture({
      series: createSeries([
        dieselRow({ averagePrice: '6', state: 'SAO PAULO', stationCount: 3 }),
        dieselRow({ averagePrice: '7', state: 'SAO PAULO', stationCount: 1 }),
        dieselRow({ averagePrice: '5', state: 'ESPIRITO SANTO', stationCount: 3 }),
        dieselRow({ averagePrice: '5.001', state: 'ESPIRITO SANTO', stationCount: 1 }),
      ]),
    })

    const result = await fixture.run()

    expect(result.counters).toMatchObject({ eligible: 102, written: 102 })
    expect(fixture.gateway.written).toEqual([
      {
        pricePerUnit: '6.2500',
        product: 'diesel-s10',
        state: 'SP',
        stationCount: 4,
        weekEndingOn: WEEK_ENDING_ON,
      },
      {
        pricePerUnit: '5.0003',
        product: 'diesel-s10',
        state: 'ES',
        stationCount: 4,
        weekEndingOn: WEEK_ENDING_ON,
      },
    ])
  })

  /**
   * As duas metades do combustível — o litro da ANP e o kWh da ANEEL — cabem na mesma rotina de
   * propósito: uma janela, uma linha de execução. Duas rotinas dariam duas chances de a mesma
   * instalação colher metade do preço.
   */
  test('colhe as duas metades num ciclo só, e a linha descartada aparece no contador', async () => {
    const energyUseCase = createEnergyUseCase({
      discardedRows: 2,
      tariffCount: 100,
      writtenCount: 100,
    })
    const fixture = createFixture({ energyUseCase })

    const result = await fixture.run()

    expect(energyUseCase.calls).toBe(1)
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({
      discarded_rows: 2,
      eligible: 101,
      failed: 0,
      skipped: 0,
      written: 101,
    })
  })

  test('produto que falta no arquivo não afunda os que vieram', async () => {
    const fixture = createFixture({
      series: createSeries([
        { ...GNV_ROW, averagePrice: '112.5', product: 'GLP', unit: 'R$/13kg' },
        dieselRow({ averagePrice: '6.89', state: 'SAO PAULO', stationCount: 833 }),
      ]),
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({ discarded_rows: 1, failed: 0 })
    expect(fixture.gateway.written.map((reference) => reference.product)).toEqual(['diesel-s10'])
  })

  test('semana ausente na ANP fecha na palavra dela, e o kWh é colhido do mesmo jeito', async () => {
    const energyUseCase = createEnergyUseCase()
    const fixture = createFixture({
      energyUseCase,
      series: createRejectingSeries(new Error('ANP_WEEK_UNAVAILABLE')),
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('anp_week_not_published')
    expect(result.counters).toEqual({
      anp_week_not_published: 1,
      eligible: 100,
      failed: 0,
      skipped: 0,
      written: 100,
    })
    expect(energyUseCase.calls).toBe(1)
    expect(fixture.gateway.calls).toBe(0)
  })

  test('planilha que não abre fecha em `anp_malformed_workbook`', async () => {
    const fixture = createFixture({
      series: { fetchWeeklySeries: () => Promise.resolve(parseAnpWeeklyWorkbook({ bytes: BAD })) },
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('anp_malformed_workbook')
    expect(result.counters).toMatchObject({ anp_malformed_workbook: 1, failed: 0 })
  })

  test('tarifa indisponível não descarta o litro já colhido', async () => {
    const fixture = createFixture({
      energyUseCase: createRejectingEnergyUseCase(new Error('ANEEL_TARIFF_UNAVAILABLE')),
    })

    const result = await fixture.run()

    // O ciclo fecha na falha da metade que falhou, mesmo tendo escrito a outra: o contador guarda as
    // duas coisas, e dizer `succeeded` esconderia o kWh que ninguém colheu.
    expect(result.outcome).toBe('aneel_unreachable')
    expect(result.counters).toEqual({
      aneel_unreachable: 1,
      eligible: 1,
      failed: 0,
      skipped: 0,
      written: 1,
    })
    expect(fixture.gateway.written).toHaveLength(1)
  })

  /**
   * O defeito que a spec 052 veio nomear: no cron a fatia vazia era `tariffCount: 0`, gravava nada,
   * logava nada e o processo saía com zero. A tela mostrava tarifa velha por semanas.
   */
  test('fatia vazia da ANEEL tem nome, mesmo com o litro colhido', async () => {
    const fixture = createFixture({
      energyUseCase: createEnergyUseCase({ discardedRows: 0, tariffCount: 0, writtenCount: 0 }),
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('aneel_empty_slice')
    expect(result.counters).toEqual({
      aneel_empty_slice: 1,
      eligible: 1,
      failed: 0,
      skipped: 0,
      written: 1,
    })
  })

  test('as duas metades falhando fecham na que uma pessoa resolve', async () => {
    const fixture = createFixture({
      energyUseCase: createRejectingEnergyUseCase(new Error('ANEEL_TARIFF_UNAVAILABLE')),
      series: createRejectingSeries(new Error('ANP_MALFORMED_ROW')),
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('anp_malformed_workbook')
    expect(result.counters).toMatchObject({ aneel_unreachable: 1, anp_malformed_workbook: 1 })
  })

  test('fatia vazia vence semana não publicada: uma é recorte, a outra é espera', async () => {
    const fixture = createFixture({
      energyUseCase: createEnergyUseCase({ discardedRows: 0, tariffCount: 0, writtenCount: 0 }),
      series: createRejectingSeries(new Error('ANP_WEEK_UNAVAILABLE')),
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('aneel_empty_slice')
  })

  test('erro sem causa conhecida fecha em `unexpected_error`, e o log leva só o nome dele', async () => {
    const fixture = createFixture({
      series: createRejectingSeries(new RangeError('index out of range')),
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('unexpected_error')
    expect(result.counters).toMatchObject({ failed: 1 })

    const failure = fixture.logged.find(
      (entry) => entry.message === 'fuel_price_pull_reference_failed',
    )
    expect(failure?.metadata).toEqual({
      correlationId: CORRELATION_ID,
      executionId: EXECUTION_ID,
      reason: 'RangeError',
    })
  })

  test('parada pedida antes do kWh guarda o litro e não chama a ANEEL', async () => {
    const energyUseCase = createEnergyUseCase()
    const fixture = createFixture({ energyUseCase, stopRequested: true })

    const result = await fixture.run()

    // `succeeded` de propósito: quem traduz parada em `cancelled` é o invólucro, e só de cima disto.
    expect(result.outcome).toBe('succeeded')
    expect(energyUseCase.calls).toBe(0)
    expect(result.counters).toMatchObject({ eligible: 1, written: 1 })
  })
})

describe('fuel price pull registration', () => {
  test('a rotina registrada fecha a linha com o código dela, não com `job_run_routine_missing`', async () => {
    const finishes: FinishJobExecutionParams[] = []
    const logged: LoggedMessage[] = []
    const claimed: ClaimedJobExecution = { job: FUEL_PRICE_PULL_JOB, origin: 'schedule' }

    const executions: JobExecutionPort = {
      claim: async () => claimed,
      finish: async (params) => {
        finishes.push(params)
      },
      renew: async () => ({ cancelRequestedAt: undefined }),
    }

    const envelope: JobRunEnvelopeV1 = {
      correlationId: CORRELATION_ID,
      eventId: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
      occurredAt: '2026-08-16T06:00:00.000Z',
      payload: { executionId: EXECUTION_ID, job: FUEL_PRICE_PULL_JOB, origin: 'schedule' },
      type: 'transportada.job.run.requested',
      version: 1,
    }

    const logger: WorkerLogger = createLoggerDouble(logged)

    const result = await runJobCycle({
      dependencies: {
        executions,
        logger,
        now: () => NOW,
        routines: {
          [FUEL_PRICE_PULL_JOB]: createFuelPricePullRoutine({
            energyUseCase: createEnergyUseCase(),
            logger,
            now: () => NOW,
            pullUseCase: createPullFuelReferenceUseCase({
              gateway: createGateway(),
              logger,
              series: createSeries([GNV_ROW]),
            }),
          }),
        },
        scheduleInterval: createManualScheduler().scheduler,
      },
      envelope,
    })

    expect(result).toEqual({ claimed: true, outcome: 'succeeded' })
    expect(finishes).toEqual([
      {
        counters: { eligible: 101, failed: 0, skipped: 0, written: 101 },
        executionId: EXECUTION_ID,
        finishedAt: NOW,
        outcome: 'succeeded',
      },
    ])
    expect(logged.map((entry) => entry.message)).not.toContain('job_run_routine_missing')
  })
})

// Três bytes que não são um ZIP: o começo mais curto de uma planilha que não abre.
const BAD = new Uint8Array([1, 2, 3])
