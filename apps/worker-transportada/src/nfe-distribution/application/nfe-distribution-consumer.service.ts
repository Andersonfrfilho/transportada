/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DfeItem,
  NfeDistribuicaoConfig,
  NfeDistribuicaoResult,
} from '@adatechnology/fiscal-provider'

import { safeLogInfo } from '../../logging/safe-logger.service.js'
import type { NfeProcessingEnvelopeV1 } from '../../messaging/nfe-processing-envelope.schema.js'
import type { WorkerLogger } from '../../shared/worker.types.js'

type DistributionCursorRecord = {
  readonly companyId: string
  readonly environment: 'homologation' | 'production'
  readonly leaseExpiresAt: Date | null
  readonly leaseOwner: string | null
  readonly maxNsu: string
  readonly nextAllowedAt: Date | null
  readonly ultNsu: string
  readonly version: bigint
}

type NfeDistributionEnvironment = 'homologation' | 'production'

type NfeDistributionRuntimeConfig = Omit<NfeDistribuicaoConfig, 'environment'> & {
  readonly environment: NfeDistributionEnvironment
}

type NfeDistributionGateway = {
  consultarDFe(input: {
    readonly config: NfeDistributionRuntimeConfig
    readonly ultNSU: string
  }): Promise<NfeDistribuicaoResult>
}

type NfeDistributionGatewayFactory = {
  create(input: { readonly config: NfeDistributionRuntimeConfig }): NfeDistributionGateway
}

type NfeDistributionCursorRepositoryPort = {
  acquireLease(input: {
    readonly companyId: string
    readonly environment: 'homologation' | 'production'
    readonly leaseMs: number
    readonly now: Date
    readonly owner: string
  }): Promise<DistributionCursorRecord | null>
  releaseLease(input: {
    readonly companyId: string
    readonly environment: 'homologation' | 'production'
    readonly owner: string
  }): Promise<void>
  saveCursor(input: {
    readonly companyId: string
    readonly environment: 'homologation' | 'production'
    readonly maxNsu: string
    readonly nextAllowedAt: Date | null
    readonly owner: string
    readonly ultNsu: string
  }): Promise<void>
}

type NfeDistributionProfilePort = {
  loadConfig(input: { readonly companyId: string }): Promise<NfeDistributionRuntimeConfig>
}

export type NfeDistributionRepositoryPort = {
  finalizeImport(input: {
    readonly companyId: string
    readonly duplicatedCount: number
    readonly importId: string
    readonly importedCount: number
    readonly processedCount: number
    readonly receivedCount: number
    readonly status: 'completed'
  }): Promise<void>
  persistPage(input: {
    readonly companyId: string
    readonly environment: 'homologation' | 'production'
    readonly importId: string
    readonly items: readonly DfeItem[]
    readonly maxNsu: string
    readonly ultNsu: string
  }): Promise<{
    readonly acceptedCount: number
    readonly duplicatedCount: number
  }>
}

type NfeDistributionClock = {
  now(): Date
}

type NfeDistributionConsumer = {
  execute(input: { readonly envelope: NfeProcessingEnvelopeV1 }): Promise<{
    readonly duplicatedCount: number
    readonly fetchedCount: number
    readonly persistedCount: number
    readonly status: 'completed' | 'rate-limited'
    readonly ultNsu: string
  }>
}

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const LEASE_OWNER = 'distribution-consumer'

export function createNfeDistributionConsumer(input: {
  readonly clock: NfeDistributionClock
  readonly cursorRepository: NfeDistributionCursorRepositoryPort
  readonly gatewayFactory: NfeDistributionGatewayFactory
  readonly leaseMs: number
  readonly logger: WorkerLogger
  readonly profile: NfeDistributionProfilePort
  readonly repository: NfeDistributionRepositoryPort
}): NfeDistributionConsumer {
  return {
    async execute(params: { readonly envelope: NfeProcessingEnvelopeV1 }): Promise<{
      readonly duplicatedCount: number
      readonly fetchedCount: number
      readonly persistedCount: number
      readonly status: 'completed' | 'rate-limited'
      readonly ultNsu: string
    }> {
      const config = await input.profile.loadConfig({
        companyId: params.envelope.companyId,
      })
      const now = input.clock.now()
      const cursor = await input.cursorRepository.acquireLease({
        companyId: params.envelope.companyId,
        environment: config.environment,
        leaseMs: input.leaseMs,
        now,
        owner: LEASE_OWNER,
      })
      if (cursor === null) {
        throw new Error('NF-e distribution lease is already held by another worker')
      }

      if (cursor.nextAllowedAt !== null && cursor.nextAllowedAt.getTime() > now.getTime()) {
        try {
          await input.repository.finalizeImport({
            companyId: params.envelope.companyId,
            duplicatedCount: 0,
            importId: params.envelope.payload.importId,
            importedCount: 0,
            processedCount: 0,
            receivedCount: 0,
            status: 'completed',
          })

          return {
            duplicatedCount: 0,
            fetchedCount: 0,
            persistedCount: 0,
            status: 'rate-limited',
            ultNsu: cursor.ultNsu,
          }
        } finally {
          await input.cursorRepository.releaseLease({
            companyId: params.envelope.companyId,
            environment: config.environment,
            owner: LEASE_OWNER,
          })
        }
      }

      const gateway = input.gatewayFactory.create({ config })
      let duplicatedCount = 0
      let fetchedCount = 0
      let persistedCount = 0
      let ultNsu = cursor.ultNsu
      let status: 'completed' | 'rate-limited' = 'completed'

      try {
        while (true) {
          const page = await gateway.consultarDFe({
            config,
            ultNSU: ultNsu,
          })
          fetchedCount += page.itens.length

          safeLogInfo({
            logger: input.logger,
            message: 'nfe_distribution_sefaz_page_received',
            metadata: {
              companyId: params.envelope.companyId,
              fetched: page.itens.length,
              importId: params.envelope.payload.importId,
              maxNsu: page.maxNSU,
              temMais: page.temMais,
              ultNsu: page.ultNSU,
            },
          })

          if (page.itens.length === 0) {
            status = 'rate-limited'
            await input.cursorRepository.saveCursor({
              companyId: params.envelope.companyId,
              environment: config.environment,
              maxNsu: page.maxNSU,
              nextAllowedAt: new Date(input.clock.now().getTime() + RATE_LIMIT_WINDOW_MS),
              owner: LEASE_OWNER,
              ultNsu,
            })
            break
          }

          const persistence = await input.repository.persistPage({
            companyId: params.envelope.companyId,
            environment: config.environment,
            importId: params.envelope.payload.importId,
            items: page.itens,
            maxNsu: page.maxNSU,
            ultNsu: page.ultNSU,
          })
          duplicatedCount += persistence.duplicatedCount
          persistedCount += persistence.acceptedCount
          ultNsu = page.ultNSU

          await input.cursorRepository.saveCursor({
            companyId: params.envelope.companyId,
            environment: config.environment,
            maxNsu: page.maxNSU,
            nextAllowedAt: null,
            owner: LEASE_OWNER,
            ultNsu,
          })

          if (!page.temMais) {
            break
          }
        }

        await input.repository.finalizeImport({
          companyId: params.envelope.companyId,
          duplicatedCount,
          importId: params.envelope.payload.importId,
          importedCount: persistedCount,
          processedCount: fetchedCount,
          receivedCount: fetchedCount,
          status: 'completed',
        })

        return {
          duplicatedCount,
          fetchedCount,
          persistedCount,
          status,
          ultNsu,
        }
      } finally {
        await input.cursorRepository.releaseLease({
          companyId: params.envelope.companyId,
          environment: config.environment,
          owner: LEASE_OWNER,
        })
      }
    },
  }
}
