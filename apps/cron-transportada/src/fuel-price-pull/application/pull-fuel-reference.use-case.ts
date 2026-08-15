/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A semana pedida vem do relógio, mas quem manda na semana gravada é a planilha: o `weekEndingOn`
 * sai das datas da própria linha, e é ele que fecha a chave natural. Coleta que falha nunca chega
 * ao banco — a referência da semana anterior continua de pé.
 */
import type { CronLogger } from '../../config/cron.types.js'
import { aggregateFuelReferences } from '../domain/fuel-reference.policy.js'
import { resolveReferenceWeek } from '../domain/reference-week.policy.js'

import type { FuelReferenceGatewayPort, FuelReferenceRecord } from './fuel-reference.port.js'
import type { FuelSeriesPort } from './fuel-series.port.js'

export type PullFuelReferenceResult = {
  readonly discardedRows: number
  readonly insertedCount: number
  readonly referenceCount: number
  readonly skippedCount: number
  readonly weekEndingOn: string
}

export type PullFuelReferenceUseCase = {
  readonly execute: (input: { readonly now: Date }) => Promise<PullFuelReferenceResult>
}

export function createPullFuelReferenceUseCase(dependencies: {
  readonly gateway: FuelReferenceGatewayPort
  readonly logger: CronLogger
  readonly series: FuelSeriesPort
}): PullFuelReferenceUseCase {
  return {
    async execute(input) {
      const week = resolveReferenceWeek({ today: input.now })
      const series = await dependencies.series.fetchWeeklySeries(week)
      const references: readonly FuelReferenceRecord[] = aggregateFuelReferences({
        samples: series.references,
      }).map((reference) => ({ ...reference, weekEndingOn: series.weekEndingOn }))
      const { insertedCount } = await dependencies.gateway.insertMissing({
        collectedAt: input.now,
        references,
      })

      dependencies.logger.info('fuel_reference_pull_completed', {
        discardedRows: series.discardedRows,
        insertedCount,
        referenceCount: references.length,
        weekEndingOn: series.weekEndingOn,
      })

      return {
        discardedRows: series.discardedRows,
        insertedCount,
        referenceCount: references.length,
        skippedCount: references.length - insertedCount,
        weekEndingOn: series.weekEndingOn,
      }
    },
  }
}
