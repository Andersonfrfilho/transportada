/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DfeItem,
  NfeDistribuicaoConfig,
  NfeDistribuicaoResult,
} from '@adatechnology/fiscal-provider'

import { safeLogError, safeLogInfo, safeLogWarn } from '../../logging/safe-logger.service.js'
import type { NfeProcessingEnvelopeV1 } from '../../messaging/nfe-processing-envelope.schema.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { decideCursorRecovery } from '../domain/cursor-recovery.policy.js'
import { isSefazDistributionRateLimit } from '../domain/sefaz-rate-limit.policy.js'

type DistributionCursorRecord = {
  readonly companyId: string
  readonly consecutiveRateLimits: number
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
  resyncCursor(input: {
    readonly companyId: string
    readonly environment: 'homologation' | 'production'
    readonly now: Date
    readonly owner: string
    readonly skippedFromNsu: string
    readonly skippedToNsu: string
    readonly ultNsu: string
  }): Promise<void>
  saveCursor(input: {
    readonly companyId: string
    readonly consecutiveRateLimits: number
    readonly environment: 'homologation' | 'production'
    readonly maxNsu: string
    readonly nextAllowedAt: Date | null
    readonly owner: string
    readonly skipped?: {
      readonly fromNsu: string
      readonly toNsu: string
    }
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
    readonly skippedCount: number
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
const UNKNOWN_ERROR_CODE = 'UNKNOWN'
const UNKNOWN_ERROR_NAME = 'UnknownError'

type PullFailureDescription = {
  readonly errorCode: string
  readonly errorName: string
  readonly providerMessage: string
}

// `rawResponse` do erro fiscal carrega o XML da SEFAZ — nunca entra em log
function describePullFailure(error: unknown): PullFailureDescription {
  if (typeof error !== 'object' || error === null) {
    return {
      errorCode: UNKNOWN_ERROR_CODE,
      errorName: UNKNOWN_ERROR_NAME,
      providerMessage: '',
    }
  }

  const candidate = error as {
    readonly code?: unknown
    readonly message?: unknown
    readonly name?: unknown
    readonly providerMessage?: unknown
  }

  return {
    errorCode: typeof candidate.code === 'string' ? candidate.code : UNKNOWN_ERROR_CODE,
    errorName: typeof candidate.name === 'string' ? candidate.name : UNKNOWN_ERROR_NAME,
    providerMessage:
      typeof candidate.providerMessage === 'string'
        ? candidate.providerMessage
        : typeof candidate.message === 'string'
          ? candidate.message
          : '',
  }
}

async function openRateLimitWindow(input: {
  readonly clock: NfeDistributionClock
  readonly companyId: string
  readonly consecutiveRateLimits: number
  readonly cursorRepository: NfeDistributionCursorRepositoryPort
  readonly environment: NfeDistributionEnvironment
  readonly importId: string
  readonly logger: WorkerLogger
  readonly maxNsu: string
  readonly ultNsu: string
}): Promise<void> {
  const nextAllowedAt = new Date(input.clock.now().getTime() + RATE_LIMIT_WINDOW_MS)
  await input.cursorRepository.saveCursor({
    companyId: input.companyId,
    consecutiveRateLimits: input.consecutiveRateLimits,
    environment: input.environment,
    maxNsu: input.maxNsu,
    nextAllowedAt,
    owner: LEASE_OWNER,
    ultNsu: input.ultNsu,
  })

  safeLogInfo({
    logger: input.logger,
    message: 'nfe_distribution_rate_limit_window_applied',
    metadata: {
      companyId: input.companyId,
      environment: input.environment,
      importId: input.importId,
      maxNsu: input.maxNsu,
      nextAllowedAt: nextAllowedAt.toISOString(),
      ultNsu: input.ultNsu,
    },
  })
}

/**
 * O salto é gravado por método próprio: a janela de uma hora não é opção de quem chama, senão o
 * tick seguinte do cron consultaria dentro do bloqueio corrente e zeraria a contagem da SEFAZ.
 */
async function resyncCursorToWatermark(input: {
  readonly clock: NfeDistributionClock
  readonly companyId: string
  readonly cursorRepository: NfeDistributionCursorRepositoryPort
  readonly environment: NfeDistributionEnvironment
  readonly importId: string
  readonly logger: WorkerLogger
  readonly maxNsu: string
  readonly ultNsu: string
}): Promise<void> {
  await input.cursorRepository.resyncCursor({
    companyId: input.companyId,
    environment: input.environment,
    now: input.clock.now(),
    owner: LEASE_OWNER,
    skippedFromNsu: input.ultNsu,
    skippedToNsu: input.maxNsu,
    ultNsu: input.maxNsu,
  })

  safeLogWarn({
    logger: input.logger,
    message: 'nfe_distribution_cursor_resynced',
    metadata: {
      companyId: input.companyId,
      environment: input.environment,
      importId: input.importId,
      skippedFromNsu: input.ultNsu,
      skippedToNsu: input.maxNsu,
      ultNsu: input.maxNsu,
    },
  })
}

function firstNsuOf(items: readonly DfeItem[]): string | undefined {
  return items.map((item) => item.nsu).sort()[0]
}

/**
 * Uma página que não persiste não pode segurar o cursor: o retry seguinte reconsultaria o mesmo
 * `ultNSU` que a SEFAZ já serviu, e é isso que a NT 2014.002 §3.11.4.1 chama de fora de sequência.
 */
async function persistPageOrSkip(input: {
  readonly companyId: string
  readonly environment: NfeDistributionEnvironment
  readonly importId: string
  readonly logger: WorkerLogger
  readonly page: NfeDistribuicaoResult
  readonly repository: NfeDistributionRepositoryPort
}): Promise<
  | {
      readonly acceptedCount: number
      readonly duplicatedCount: number
      readonly skippedCount: number
    }
  | undefined
> {
  try {
    return await input.repository.persistPage({
      companyId: input.companyId,
      environment: input.environment,
      importId: input.importId,
      items: input.page.itens,
      maxNsu: input.page.maxNSU,
      ultNsu: input.page.ultNSU,
    })
  } catch (error: unknown) {
    safeLogError({
      logger: input.logger,
      message: 'nfe_distribution_page_skipped',
      metadata: {
        companyId: input.companyId,
        environment: input.environment,
        fetched: input.page.itens.length,
        importId: input.importId,
        ultNsu: input.page.ultNSU,
        ...describePullFailure(error),
      },
    })
    return undefined
  }
}

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
        safeLogWarn({
          logger: input.logger,
          message: 'nfe_distribution_lease_unavailable',
          metadata: {
            companyId: params.envelope.companyId,
            environment: config.environment,
            importId: params.envelope.payload.importId,
          },
        })
        throw new Error('NF-e distribution lease is already held by another worker')
      }

      if (cursor.nextAllowedAt !== null && cursor.nextAllowedAt.getTime() > now.getTime()) {
        safeLogWarn({
          logger: input.logger,
          message: 'nfe_distribution_pull_skipped_cooldown',
          metadata: {
            companyId: params.envelope.companyId,
            environment: config.environment,
            importId: params.envelope.payload.importId,
            nextAllowedAt: cursor.nextAllowedAt.toISOString(),
            ultNsu: cursor.ultNsu,
          },
        })

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
      let skippedCount = 0
      let maxNsu = cursor.maxNsu
      let ultNsu = cursor.ultNsu
      let status: 'completed' | 'rate-limited' = 'completed'

      safeLogInfo({
        logger: input.logger,
        message: 'nfe_distribution_pull_started',
        metadata: {
          companyId: params.envelope.companyId,
          environment: config.environment,
          importId: params.envelope.payload.importId,
          ultNsu,
        },
      })

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
              environment: config.environment,
              fetched: page.itens.length,
              importId: params.envelope.payload.importId,
              maxNsu: page.maxNSU,
              temMais: page.temMais,
              ultNsu: page.ultNSU,
            },
          })

          if (page.itens.length === 0) {
            status = 'rate-limited'
            maxNsu = page.maxNSU
            await openRateLimitWindow({
              clock: input.clock,
              companyId: params.envelope.companyId,
              consecutiveRateLimits: 0,
              cursorRepository: input.cursorRepository,
              environment: config.environment,
              importId: params.envelope.payload.importId,
              logger: input.logger,
              maxNsu,
              ultNsu,
            })
            break
          }

          const persistence = await persistPageOrSkip({
            companyId: params.envelope.companyId,
            environment: config.environment,
            importId: params.envelope.payload.importId,
            logger: input.logger,
            page,
            repository: input.repository,
          })
          const fromNsu = ultNsu
          maxNsu = page.maxNSU
          ultNsu = page.ultNSU

          if (persistence === undefined) {
            // Perder documento é recuperável por consNSU; ficar fora de sequência bloqueia o CNPJ
            await input.cursorRepository.saveCursor({
              companyId: params.envelope.companyId,
              consecutiveRateLimits: 0,
              environment: config.environment,
              maxNsu,
              nextAllowedAt: null,
              owner: LEASE_OWNER,
              skipped: { fromNsu: firstNsuOf(page.itens) ?? fromNsu, toNsu: ultNsu },
              ultNsu,
            })
            break
          }

          duplicatedCount += persistence.duplicatedCount
          persistedCount += persistence.acceptedCount
          skippedCount += persistence.skippedCount

          safeLogInfo({
            logger: input.logger,
            message: 'nfe_distribution_page_persisted',
            metadata: {
              accepted: persistence.acceptedCount,
              companyId: params.envelope.companyId,
              duplicated: persistence.duplicatedCount,
              environment: config.environment,
              importId: params.envelope.payload.importId,
              skipped: persistence.skippedCount,
              ultNsu,
            },
          })

          await input.cursorRepository.saveCursor({
            companyId: params.envelope.companyId,
            consecutiveRateLimits: 0,
            environment: config.environment,
            maxNsu,
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

        safeLogInfo({
          logger: input.logger,
          message: 'nfe_distribution_pull_finished',
          metadata: {
            companyId: params.envelope.companyId,
            duplicated: duplicatedCount,
            environment: config.environment,
            fetched: fetchedCount,
            importId: params.envelope.payload.importId,
            persisted: persistedCount,
            skipped: skippedCount,
            status,
            ultNsu,
          },
        })

        return {
          duplicatedCount,
          fetchedCount,
          persistedCount,
          status,
          ultNsu,
        }
      } catch (error: unknown) {
        // Só aqui o código da SEFAZ ainda é tipado; acima da pilha vira mensagem opaca
        if (!isSefazDistributionRateLimit(error)) {
          safeLogError({
            logger: input.logger,
            message: 'nfe_distribution_pull_failed',
            metadata: {
              companyId: params.envelope.companyId,
              environment: config.environment,
              importId: params.envelope.payload.importId,
              ultNsu,
              ...describePullFailure(error),
            },
          })
          throw error
        }

        // Relançar reentregaria em segundos, e cada retry rearma a hora de bloqueio no CNPJ
        safeLogWarn({
          logger: input.logger,
          message: 'nfe_distribution_rate_limited_by_sefaz',
          metadata: {
            companyId: params.envelope.companyId,
            environment: config.environment,
            importId: params.envelope.payload.importId,
            ultNsu,
            ...describePullFailure(error),
          },
        })

        const recovery = decideCursorRecovery({
          consecutiveRateLimits: cursor.consecutiveRateLimits,
          maxNsu,
          ultNsu,
        })
        if (recovery.kind === 'resync') {
          await resyncCursorToWatermark({
            clock: input.clock,
            companyId: params.envelope.companyId,
            cursorRepository: input.cursorRepository,
            environment: config.environment,
            importId: params.envelope.payload.importId,
            logger: input.logger,
            maxNsu,
            ultNsu,
          })
        } else {
          await openRateLimitWindow({
            clock: input.clock,
            companyId: params.envelope.companyId,
            consecutiveRateLimits: recovery.consecutiveRateLimits,
            cursorRepository: input.cursorRepository,
            environment: config.environment,
            importId: params.envelope.payload.importId,
            logger: input.logger,
            maxNsu,
            ultNsu,
          })
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
          status: 'rate-limited',
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
