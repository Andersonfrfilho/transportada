/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A segunda metade do preço do combustível: o kWh homologado da ANEEL, ao lado do litro da ANP.
 * O dia é o do relógio do ciclo, e é ele que decide qual vigência está aberta.
 */
import type { CronLogger } from '../../config/cron.types.js'

import type { EnergyTariffSeriesPort } from './energy-series.port.js'
import type { EnergyTariffGatewayPort } from './energy-tariff.port.js'

export type PullEnergyTariffResult = {
  readonly discardedRows: number
  readonly tariffCount: number
  readonly writtenCount: number
}

export type PullEnergyTariffUseCase = {
  readonly execute: (input: { readonly now: Date }) => Promise<PullEnergyTariffResult>
}

function toDay(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function createPullEnergyTariffUseCase(dependencies: {
  readonly gateway: EnergyTariffGatewayPort
  readonly logger: CronLogger
  readonly series: EnergyTariffSeriesPort
}): PullEnergyTariffUseCase {
  return {
    async execute(input) {
      const onDay = toDay(input.now)
      const selection = await dependencies.series.fetchCurrentTariffs({ onDay })
      const { writtenCount } = await dependencies.gateway.upsertCurrent({
        collectedAt: input.now,
        tariffs: selection.tariffs,
      })

      dependencies.logger.info('energy_tariff_pull_completed', {
        discardedRows: selection.discardedRows,
        onDay,
        tariffCount: selection.tariffs.length,
        writtenCount,
      })

      return {
        discardedRows: selection.discardedRows,
        tariffCount: selection.tariffs.length,
        writtenCount,
      }
    },
  }
}
