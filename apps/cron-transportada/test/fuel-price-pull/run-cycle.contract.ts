/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CronLogger } from '../../src/config/cron.types.js'
import type { AdvisoryLockPort } from '../../src/shared/advisory-lock.port.js'
import type {
  FuelReferenceGatewayPort,
  FuelReferenceRecord,
} from '../../src/fuel-price-pull/application/fuel-reference.port.js'
import type { FuelSeriesPort } from '../../src/fuel-price-pull/application/fuel-series.port.js'
import type { PullEnergyTariffUseCase } from '../../src/fuel-price-pull/application/pull-energy-tariff.use-case.js'
import { createPullFuelReferenceUseCase } from '../../src/fuel-price-pull/application/pull-fuel-reference.use-case.js'
import { runFuelPricePullCycle } from '../../src/fuel-price-pull/application/run-cycle.js'
import { parseAnpWeeklyWorkbook } from '../../src/fuel-price-pull/infrastructure/anp-series.client.js'

import { type AnpSheetRow, buildAnpWorkbook } from './workbook.fixture.js'

const JOB_ID = 'fuel.price.pull'
const NOW = new Date('2026-08-16T06:00:00.000Z')

function createLogger(): CronLogger {
  return { error: () => undefined, info: () => undefined, warn: () => undefined }
}

function createLock(acquired: boolean): AdvisoryLockPort & { readonly releases: string[] } {
  const releases: string[] = []
  return {
    releases,
    release: (input) => {
      releases.push(input.lockKey)
      return Promise.resolve()
    },
    tryAcquire: () => Promise.resolve(acquired),
  }
}

function createGateway(
  existing: readonly FuelReferenceRecord[] = [],
): FuelReferenceGatewayPort & { readonly written: FuelReferenceRecord[]; calls: number } {
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

function createFailingSeries(): FuelSeriesPort {
  return {
    fetchWeeklySeries: () => Promise.reject(new Error('ANP_WEEK_UNAVAILABLE')),
  }
}

function createEnergyUseCase(
  result: {
    readonly discardedRows: number
    readonly tariffCount: number
    readonly writtenCount: number
  } = {
    discardedRows: 0,
    tariffCount: 0,
    writtenCount: 0,
  },
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

function createFailingEnergyUseCase(): PullEnergyTariffUseCase {
  return { execute: () => Promise.reject(new Error('ANEEL_TARIFF_UNAVAILABLE')) }
}

function runCycle(input: {
  readonly energyUseCase?: PullEnergyTariffUseCase
  readonly gateway: FuelReferenceGatewayPort
  readonly lock: AdvisoryLockPort
  readonly series: FuelSeriesPort
}): ReturnType<typeof runFuelPricePullCycle> {
  const logger = createLogger()
  return runFuelPricePullCycle({
    correlationId: '00000000-0000-4000-8000-0000000000f1',
    energyUseCase: input.energyUseCase ?? createEnergyUseCase(),
    jobId: JOB_ID,
    lock: input.lock,
    logger,
    now: NOW,
    pullUseCase: createPullFuelReferenceUseCase({
      gateway: input.gateway,
      logger,
      series: input.series,
    }),
  })
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

describe('fuel price pull cycle', () => {
  test('is a clean no-op when another instance holds the lock', async () => {
    const gateway = createGateway()
    const lock = createLock(false)
    const result = await runCycle({ gateway, lock, series: createSeries([GNV_ROW]) })

    expect(result.acquiredLock).toBeFalse()
    expect(result.failedCount).toBe(0)
    expect(gateway.calls).toBe(0)
    expect(lock.releases).toBeEmpty()
  })

  test('writes one reference per pair and releases the lock', async () => {
    const gateway = createGateway()
    const lock = createLock(true)
    const result = await runCycle({
      gateway,
      lock,
      series: createSeries([
        GNV_ROW,
        dieselRow({ averagePrice: '6.89', state: 'SAO PAULO', stationCount: 833 }),
      ]),
    })

    expect(result).toMatchObject({
      acquiredLock: true,
      eligibleCount: 2,
      enqueuedCount: 2,
      failedCount: 0,
      skippedCount: 0,
    })
    expect(gateway.written).toEqual([
      {
        pricePerUnit: '4.3900',
        product: 'gnv',
        state: 'AL',
        stationCount: 13,
        weekEndingOn: '2026-08-15',
      },
      {
        pricePerUnit: '6.8900',
        product: 'diesel-s10',
        state: 'SP',
        stationCount: 833,
        weekEndingOn: '2026-08-15',
      },
    ])
    expect(lock.releases).toEqual([`cron:${JOB_ID}`])
  })

  test('re-running the same week is a no-op through the natural key', async () => {
    const gateway = createGateway([
      {
        pricePerUnit: '4.3900',
        product: 'gnv',
        state: 'AL',
        stationCount: 13,
        weekEndingOn: '2026-08-15',
      },
    ])
    const result = await runCycle({
      gateway,
      lock: createLock(true),
      series: createSeries([GNV_ROW]),
    })

    expect(result).toMatchObject({
      eligibleCount: 1,
      enqueuedCount: 0,
      failedCount: 0,
      skippedCount: 1,
    })
    expect(gateway.written).toBeEmpty()
  })

  test('a collection failure exits non-zero and leaves the previous reference untouched', async () => {
    const gateway = createGateway()
    const lock = createLock(true)
    const result = await runCycle({ gateway, lock, series: createFailingSeries() })

    expect(result.failedCount).toBe(1)
    expect(result.enqueuedCount).toBe(0)
    expect(gateway.calls).toBe(0)
    expect(lock.releases).toEqual([`cron:${JOB_ID}`])
  })

  test('aggregates by (product, state) with the station count as the weight', async () => {
    const gateway = createGateway()
    const result = await runCycle({
      gateway,
      lock: createLock(true),
      series: createSeries([
        dieselRow({ averagePrice: '6', state: 'SAO PAULO', stationCount: 3 }),
        dieselRow({ averagePrice: '7', state: 'SAO PAULO', stationCount: 1 }),
        dieselRow({ averagePrice: '5', state: 'ESPIRITO SANTO', stationCount: 3 }),
        dieselRow({ averagePrice: '5.001', state: 'ESPIRITO SANTO', stationCount: 1 }),
      ]),
    })

    expect(result.eligibleCount).toBe(2)
    const expected: readonly Omit<FuelReferenceRecord, 'weekEndingOn'>[] = [
      { pricePerUnit: '6.2500', product: 'diesel-s10', state: 'SP', stationCount: 4 },
      { pricePerUnit: '5.0003', product: 'diesel-s10', state: 'ES', stationCount: 4 },
    ]

    expect(gateway.written).toEqual(
      expected.map((reference) => ({ ...reference, weekEndingOn: '2026-08-15' })),
    )
  })

  /**
   * As duas metades do combustível — o litro da ANP e o kWh da ANEEL — cabem no mesmo job de
   * propósito: um deploy, uma janela e **um** advisory lock. Duas janelas dariam duas chances de a
   * mesma instalação colher metade do preço.
   */
  test('collects both halves under the one lock, and releases it once', async () => {
    const energyUseCase = createEnergyUseCase({
      discardedRows: 2,
      tariffCount: 100,
      writtenCount: 100,
    })
    const gateway = createGateway()
    const lock = createLock(true)
    const result = await runCycle({
      energyUseCase,
      gateway,
      lock,
      series: createSeries([GNV_ROW]),
    })

    expect(energyUseCase.calls).toBe(1)
    expect(result).toMatchObject({
      acquiredLock: true,
      eligibleCount: 101,
      enqueuedCount: 101,
      failedCount: 0,
    })
    expect(result.ineligibleCounts).toMatchObject({ discardedRows: 2 })
    expect(lock.releases).toEqual([`cron:${JOB_ID}`])
  })

  test('the tariff being unavailable does not discard the litre already collected', async () => {
    const gateway = createGateway()
    const lock = createLock(true)
    const result = await runCycle({
      energyUseCase: createFailingEnergyUseCase(),
      gateway,
      lock,
      series: createSeries([GNV_ROW]),
    })

    expect(result.failedCount).toBe(1)
    expect(result.enqueuedCount).toBe(1)
    expect(gateway.written).toHaveLength(1)
    expect(lock.releases).toEqual([`cron:${JOB_ID}`])
  })

  test('the ANP week being unavailable still lets the tariff be collected', async () => {
    const energyUseCase = createEnergyUseCase({
      discardedRows: 0,
      tariffCount: 100,
      writtenCount: 100,
    })
    const result = await runCycle({
      energyUseCase,
      gateway: createGateway(),
      lock: createLock(true),
      series: createFailingSeries(),
    })

    expect(result.failedCount).toBe(1)
    expect(result.enqueuedCount).toBe(100)
    expect(energyUseCase.calls).toBe(1)
  })

  test('a product missing from the file does not sink the ones that came', async () => {
    const gateway = createGateway()
    const result = await runCycle({
      gateway,
      lock: createLock(true),
      series: createSeries([
        { ...GNV_ROW, averagePrice: '112.5', product: 'GLP', unit: 'R$/13kg' },
        dieselRow({ averagePrice: '6.89', state: 'SAO PAULO', stationCount: 833 }),
      ]),
    })

    expect(result.failedCount).toBe(0)
    expect(result.ineligibleCounts).toMatchObject({ discardedRows: 1 })
    expect(gateway.written.map((reference) => reference.product)).toEqual(['diesel-s10'])
  })
})
