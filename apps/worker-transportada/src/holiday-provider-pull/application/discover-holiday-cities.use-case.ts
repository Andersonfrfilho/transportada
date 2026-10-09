/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Etapa 1 da rotina (ADR-0100 §5): só banco. Anda as notas de cada empresa pelo cursor, resolve o
 * destino físico e soma a demanda de cidades. Parar no meio de um lote nunca acontece — a parada
 * pedida é lida no limite de lote e de empresa. Uma empresa que falha não derruba as outras.
 */
import { safeLogError } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  HOLIDAY_DISCOVERY_BATCH_SIZE,
  HOLIDAY_DISCOVERY_MAX_BATCHES,
} from '../domain/holiday-provider-pull.constant.js'
import { summarizeDocumentDestinations } from '../domain/holiday-city-discovery.policy.js'

import type { DiscoveryCompany, HolidayDiscoveryStore } from './holiday-discovery.port.js'

export type DiscoveryTally = {
  batches: number
  companies: number
  discardedCityCodes: number
  documentsRead: number
  documentsWithoutDestination: number
  failedCompanies: number
}

export type DiscoverHolidayCitiesDependencies = {
  readonly batchSize?: number
  readonly logger: WorkerLogger
  readonly maxBatches?: number
  readonly now: () => Date
  readonly store: HolidayDiscoveryStore
}

export type DiscoverHolidayCitiesUseCase = {
  execute(input: {
    readonly correlationId?: string
    readonly isStopRequested: () => boolean
  }): Promise<DiscoveryTally>
}

type CompanyParams = {
  readonly company: DiscoveryCompany
  readonly isStopRequested: () => boolean
  readonly tally: DiscoveryTally
}

export function createDiscoverHolidayCitiesUseCase(
  dependencies: DiscoverHolidayCitiesDependencies,
): DiscoverHolidayCitiesUseCase {
  const batchSize = dependencies.batchSize ?? HOLIDAY_DISCOVERY_BATCH_SIZE
  const maxBatches = dependencies.maxBatches ?? HOLIDAY_DISCOVERY_MAX_BATCHES
  const { store } = dependencies

  async function discoverCompany({
    company,
    isStopRequested,
    tally,
  }: CompanyParams): Promise<void> {
    let { cursor } = company

    for (let batch = 0; batch < maxBatches && !isStopRequested(); batch += 1) {
      const documents = await store.readDocumentBatch({
        companyId: company.companyId,
        cursor,
        limit: batchSize,
      })
      const last = documents.at(-1)
      if (last === undefined) return

      const documentIds = documents.map((document) => document.documentId)
      const rows = await store.readDestinations({ companyId: company.companyId, documentIds })
      const summary = summarizeDocumentDestinations({ documentIds, rows })

      await store.saveBatch({
        cityCounts: summary.cityCounts,
        companyId: company.companyId,
        cursor: last,
        seenAt: dependencies.now(),
      })

      cursor = last
      tally.batches += 1
      tally.documentsRead += documents.length
      tally.discardedCityCodes += summary.discardedCityCodes
      tally.documentsWithoutDestination += summary.documentsWithoutDestination
      if (documents.length < batchSize) return
    }
  }

  return {
    async execute({ correlationId, isStopRequested }) {
      const tally: DiscoveryTally = {
        batches: 0,
        companies: 0,
        discardedCityCodes: 0,
        documentsRead: 0,
        documentsWithoutDestination: 0,
        failedCompanies: 0,
      }

      for (const company of await store.listCompanies()) {
        if (isStopRequested()) break
        tally.companies += 1
        try {
          await discoverCompany({ company, isStopRequested, tally })
        } catch (error: unknown) {
          tally.failedCompanies += 1
          // O nome do erro, nunca a mensagem: a do banco ou da rede pode carregar o dado que falhou.
          safeLogError({
            logger: dependencies.logger,
            message: 'holiday_discovery_company_failed',
            metadata: {
              companyId: company.companyId,
              correlationId,
              reason: error instanceof Error ? error.name : 'UnknownError',
            },
          })
        }
      }

      return tally
    },
  }
}
