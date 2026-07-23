/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createLogger } from '@adatechnology/logger'
import { createRabbitMqProvider, type RabbitMqProvider } from '@adatechnology/rabbitmq-provider'
import { createSecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import { parseWorkerCryptographicConfiguration } from './config/cryptographic-configuration.schema.js'
import { parseWorkerEnvironment } from './config/environment.schema.js'
import { WorkerHealthService } from './health/health.service.js'
import { safeLogInfo } from './logging/safe-logger.service.js'
import {
  buildNfeDistributionRabbitMqTopology,
  buildNfeImportRabbitMqTopology,
} from './messaging/nfe-rabbitmq-topology.js'
import { buildCteIssuanceRabbitMqTopology } from './messaging/cte-rabbitmq-topology.js'
import type { CteProcessingEnvelopeV1 } from './messaging/cte-processing-envelope.schema.js'
import { buildRabbitMqTopology } from './messaging/rabbitmq-topology.js'
import { OutboxRelayLoop } from './outbox/application/outbox-relay-loop.service.js'
import { NfeOutboxPublisherService } from './outbox/application/nfe-outbox-publisher.service.js'
import { DrizzleCteOutboxRepository } from './cte-issuance/infrastructure/drizzle-cte-outbox.repository.js'
import { createDigitalCertificateSecretService } from './cte-issuance/application/digital-certificate-secret.service.js'
import { createCteIssuanceExecutionInputResolver } from './cte-issuance/application/cte-issuance-execution-input-resolver.service.js'
import { DrizzleCteIssuanceWorkerRepository } from './cte-issuance/infrastructure/drizzle-cte-issuance-worker.repository.js'
import { DrizzleCteIssuanceExecutionInputRepository } from './cte-issuance/infrastructure/drizzle-cte-issuance-execution-input.repository.js'
import { createAdatechnologyCteFiscalProvider } from './cte-issuance/infrastructure/adatechnology-cte-fiscal-provider.factory.js'
import { CteOutboxPublisherService } from './cte-issuance/application/cte-outbox-publisher.service.js'
import { CteOutboxRelayService } from './cte-issuance/application/cte-outbox-relay.service.js'
import { createCteIssuanceWorkerEffect } from './cte-issuance/application/cte-issuance-consumer.effect.js'
import { startCteIssuanceConsumer } from './runtime/cte-issuance-consumer.service.js'
import { startFoundationSyntheticConsumer } from './runtime/foundation-synthetic-consumer.service.js'
import { startNfeDistributionConsumer } from './runtime/nfe-distribution-consumer.service.js'
import { startNfeImportConsumer } from './runtime/nfe-import-consumer.service.js'
import { registerWorkerShutdownSignals } from './runtime/shutdown-signals.service.js'
import { WorkerShutdown } from './runtime/worker-shutdown.service.js'
import { startHealthServer } from './server/health-server.service.js'
import { DrizzleOutboxRepository } from './outbox/infrastructure/drizzle-outbox.repository.js'
import { OutboxRelayService } from './outbox/application/outbox-relay.service.js'
import {
  createNfeStorageGatewayFromEnvironment,
  type NfeStorageGateway,
} from './storage/infrastructure/nfe-storage-gateway.js'
import type { WorkerLogger } from './shared/worker.types.js'

type RuntimeDatabasePort = {
  readonly close: () => Promise<void>
  readonly db: unknown
  readonly healthCheck: () => Promise<{ readonly healthy: true }>
}

type RuntimeHealthServer =
  | Bun.Server<undefined>
  | {
      readonly port?: number
      stop(): Promise<void>
    }

type RuntimeConsumer = {
  cancel(): Promise<void>
}

type RuntimeLoggerFactory = (input: {
  readonly logLevel: ReturnType<typeof parseWorkerEnvironment>['logLevel']
  readonly pretty: boolean
  readonly projectName: string
  readonly version: string
}) => WorkerLogger

type RuntimeDatabaseFactory = (input: { readonly connection: string }) => RuntimeDatabasePort

type RuntimeRabbitMqProviderFactory = (input: {
  readonly connection: string
  readonly topology: Parameters<typeof createRabbitMqProvider>[0]['topology']
}) => Promise<RabbitMqProvider>

type RuntimeHealthServerFactory = (input: {
  readonly config: ReturnType<typeof parseWorkerEnvironment>
  readonly healthService: WorkerHealthService
  readonly logger: WorkerLogger
}) => RuntimeHealthServer

type WorkerRuntimeDependencies = {
  readonly createDatabase?: RuntimeDatabaseFactory
  readonly createLogger?: RuntimeLoggerFactory
  readonly createRabbitMqProvider?: RuntimeRabbitMqProviderFactory
  readonly createStorageGateway?: (input: {
    readonly environment: Record<string, string | undefined>
  }) => NfeStorageGateway
  readonly startDistributionConsumer?: (input: {
    readonly config: ReturnType<typeof parseWorkerEnvironment>
    readonly logger: WorkerLogger
    readonly provider: RabbitMqProvider
  }) => Promise<RuntimeConsumer | undefined>
  readonly startCteIssuanceConsumer?: (input: {
    readonly config: ReturnType<typeof parseWorkerEnvironment>
    readonly effect: {
      execute(params: { readonly envelope: CteProcessingEnvelopeV1 }): Promise<void>
    }
    readonly logger: WorkerLogger
    readonly provider: RabbitMqProvider
    readonly repository: {
      hasProcessed(input: {
        readonly attemptId: string
        readonly batchItemId: string
        readonly companyId: string
        readonly eventId: string
      }): Promise<boolean>
      markDeadLettered(input: {
        readonly attemptId: string
        readonly batchItemId: string
        readonly companyId: string
        readonly eventId: string
        readonly reason: string
      }): Promise<void>
      markProcessed(input: {
        readonly attemptId: string
        readonly batchItemId: string
        readonly companyId: string
        readonly eventId: string
      }): Promise<void>
      scheduleRetry(input: {
        readonly attempt: number
        readonly attemptId: string
        readonly batchItemId: string
        readonly companyId: string
        readonly eventId: string
        readonly nextAttemptAt: Date
      }): Promise<void>
    }
  }) => Promise<RuntimeConsumer | undefined>
  readonly startFoundationSyntheticConsumer?: (input: {
    readonly config: ReturnType<typeof parseWorkerEnvironment>
    readonly logger: WorkerLogger
    readonly provider: RabbitMqProvider
  }) => Promise<RuntimeConsumer | undefined>
  readonly startHealthServer?: RuntimeHealthServerFactory
  readonly startImportConsumer?: (input: {
    readonly config: ReturnType<typeof parseWorkerEnvironment>
    readonly logger: WorkerLogger
    readonly provider: RabbitMqProvider
  }) => Promise<RuntimeConsumer | undefined>
}

export async function startWorkerRuntime(
  params: {
    readonly dependencies?: WorkerRuntimeDependencies
    readonly environment?: Record<string, string | undefined>
  } = {},
): Promise<{
  readonly healthServer: RuntimeHealthServer
  readonly shutdown: WorkerShutdown
}> {
  const environment = params.environment ?? process.env
  const dependencies = params.dependencies ?? {}
  const config = parseWorkerEnvironment(environment)
  const cryptography = parseWorkerCryptographicConfiguration(environment)
  const loggerFactory = dependencies.createLogger ?? createLogger
  const databaseFactory = dependencies.createDatabase ?? createDrizzleProvider
  const rabbitProviderFactory = dependencies.createRabbitMqProvider ?? createRabbitMqProvider
  const syntheticStarter =
    dependencies.startFoundationSyntheticConsumer ?? startFoundationSyntheticConsumer
  const importStarter = dependencies.startImportConsumer ?? startNfeImportConsumer
  const distributionStarter = dependencies.startDistributionConsumer ?? startNfeDistributionConsumer
  const cteIssuanceStarter = dependencies.startCteIssuanceConsumer ?? startCteIssuanceConsumer
  const healthServerStarter = dependencies.startHealthServer ?? startHealthServer
  const storageGatewayFactory =
    dependencies.createStorageGateway ??
    ((input: { readonly environment: Record<string, string | undefined> }) =>
      createNfeStorageGatewayFromEnvironment({
        environment: input.environment,
        finalBucket:
          input.environment.OBJECT_STORAGE_BUCKET ??
          input.environment.STORAGE_BUCKET ??
          'transportada-private',
        stagingBucket:
          input.environment.OBJECT_STORAGE_BUCKET ??
          input.environment.STORAGE_BUCKET ??
          'transportada-private',
      }))

  const logger = loggerFactory({
    logLevel: config.logLevel,
    pretty: config.appEnv !== 'production',
    projectName: 'transportada-worker',
    version: '0.1.0',
  })
  const digitalCertificateSecretService = createDigitalCertificateSecretService({
    envelopeProvider: createSecretEnvelopeProvider(cryptography.envelopeKeyRing),
  })
  const database = databaseFactory({ connection: config.databaseUrl })
  const storageGateway = storageGatewayFactory({ environment })
  const syntheticTopology = buildRabbitMqTopology(`${config.queuePrefix}.synthetic.v1`)
  const nfeImportTopology = buildNfeImportRabbitMqTopology({
    queuePrefix: config.queuePrefix,
  })
  const nfeDistributionTopology = buildNfeDistributionRabbitMqTopology({
    queuePrefix: config.queuePrefix,
  })
  const cteIssuanceTopology = buildCteIssuanceRabbitMqTopology({
    queuePrefix: config.queuePrefix,
  })
  let provider: RabbitMqProvider | undefined
  let distributionPublisher: RabbitMqProvider | undefined
  let healthServer: RuntimeHealthServer | undefined
  let importConsumer: RuntimeConsumer | undefined
  let importPublisher: RabbitMqProvider | undefined
  let distributionConsumer: RuntimeConsumer | undefined
  let cteIssuanceConsumer: RuntimeConsumer | undefined
  let relayLoop: OutboxRelayLoop | undefined
  let cteRelayLoop: OutboxRelayLoop | undefined
  let cteIssuancePublisher: RabbitMqProvider | undefined
  let syntheticConsumer: RuntimeConsumer | undefined

  try {
    provider = await rabbitProviderFactory({
      connection: config.rabbitMqUrl,
      topology: syntheticTopology,
    })
    importPublisher = await rabbitProviderFactory({
      connection: config.rabbitMqUrl,
      topology: nfeImportTopology,
    })
    distributionPublisher = await rabbitProviderFactory({
      connection: config.rabbitMqUrl,
      topology: nfeDistributionTopology,
    })
    cteIssuancePublisher = await rabbitProviderFactory({
      connection: config.rabbitMqUrl,
      topology: cteIssuanceTopology,
    })
    const healthService = new WorkerHealthService({
      database,
      rabbitMq: provider,
      storage: storageGateway,
    })
    healthServer = healthServerStarter({
      config,
      healthService,
      logger,
    })
    syntheticConsumer = await syntheticStarter({
      config,
      logger,
      provider,
    })
    importConsumer = await importStarter({
      config,
      logger,
      provider: importPublisher,
    })
    distributionConsumer = await distributionStarter({
      config,
      logger,
      provider: distributionPublisher,
    })
    cteIssuanceConsumer = await cteIssuanceStarter({
      config,
      effect: createCteIssuanceWorkerEffect({
        createProvider: createAdatechnologyCteFiscalProvider,
        logger,
        resolveExecutionInput: createCteIssuanceExecutionInputResolver({
          repository: new DrizzleCteIssuanceExecutionInputRepository(
            database.db as ReturnType<typeof createDrizzleProvider>['db'],
          ),
          secretService: digitalCertificateSecretService,
        }),
      }),
      logger,
      provider: cteIssuancePublisher,
      repository: new DrizzleCteIssuanceWorkerRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
      ),
    })
    const relay = new OutboxRelayService({
      clock: { now: () => new Date() },
      publisher: new NfeOutboxPublisherService({
        distributionProvider: distributionPublisher,
        distributionTopology: nfeDistributionTopology,
        importProvider: importPublisher,
        importTopology: nfeImportTopology,
      }),
      repository: new DrizzleOutboxRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
      ),
      retryPolicy: {
        classify(error: unknown): never {
          throw error instanceof Error ? error : new Error('Outbox relay publish failed')
        },
      },
      topologyResolver: {
        resolve({ eventType }) {
          return eventType === 'transportada.nfe.import.requested'
            ? nfeImportTopology
            : nfeDistributionTopology
        },
      },
    })
    const cteRelay = new CteOutboxRelayService({
      clock: { now: () => new Date() },
      publisher: new CteOutboxPublisherService(cteIssuancePublisher),
      repository: new DrizzleCteOutboxRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
      ),
      retryPolicy: {
        classify(error: unknown): never {
          throw error instanceof Error ? error : new Error('CT-e outbox relay publish failed')
        },
      },
    })
    relayLoop = new OutboxRelayLoop({
      claimOwner: `${config.queuePrefix}.relay.${crypto.randomUUID()}`,
      failureMessage: 'nfe_outbox_relay_failed',
      intervalMs: 1_000,
      leaseMs: 30_000,
      limit: 25,
      logger,
      relay,
    })
    relayLoop.start()
    cteRelayLoop = new OutboxRelayLoop({
      claimOwner: `${config.queuePrefix}.cte.relay.${crypto.randomUUID()}`,
      failureMessage: 'cte_outbox_relay_failed',
      intervalMs: 1_000,
      leaseMs: 30_000,
      limit: 25,
      logger,
      relay: cteRelay,
    })
    cteRelayLoop.start()
    const shutdown = new WorkerShutdown({
      closeables: [relayLoop, cteRelayLoop, storageGateway],
      consumers: [
        syntheticConsumer,
        importConsumer,
        distributionConsumer,
        cteIssuanceConsumer,
      ].filter((consumer): consumer is RuntimeConsumer => consumer !== undefined),
      database,
      healthServer,
      provider: createCloseableGroup([
        provider,
        importPublisher,
        distributionPublisher,
        cteIssuancePublisher,
      ]),
    })
    registerWorkerShutdownSignals({ logger, shutdown })
    safeLogInfo({
      logger,
      message: 'worker_started',
      metadata: {
        environment: config.appEnv,
        foundationSyntheticConsumerEnabled: config.foundationSyntheticConsumerEnabled,
        port: healthServer.port,
      },
    })

    return { healthServer, shutdown }
  } catch (error: unknown) {
    await syntheticConsumer?.cancel().catch(() => undefined)
    await importConsumer?.cancel().catch(() => undefined)
    await distributionConsumer?.cancel().catch(() => undefined)
    await cteIssuanceConsumer?.cancel().catch(() => undefined)
    await relayLoop?.close().catch(() => undefined)
    await cteRelayLoop?.close().catch(() => undefined)
    await healthServer?.stop().catch(() => undefined)
    await storageGateway.close().catch(() => undefined)
    await distributionPublisher?.close().catch(() => undefined)
    await importPublisher?.close().catch(() => undefined)
    await cteIssuancePublisher?.close().catch(() => undefined)
    await provider?.close().catch(() => undefined)
    await database.close().catch(() => undefined)
    throw error
  }
}

export async function bootstrap(
  params: {
    readonly dependencies?: WorkerRuntimeDependencies
    readonly environment?: Record<string, string | undefined>
  } = {},
): Promise<Bun.Server<undefined>> {
  const runtime = await startWorkerRuntime(params)
  return runtime.healthServer as Bun.Server<undefined>
}

if (import.meta.main) {
  void bootstrap().catch(() => {
    process.stderr.write('worker_startup_failed\n')
    process.exitCode = 1
  })
}

function createCloseableGroup(closeables: readonly { close(): Promise<void> }[]): {
  close(): Promise<void>
} {
  return {
    async close() {
      for (const closeable of closeables) {
        await closeable.close()
      }
    },
  }
}
