/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createLogger } from '@adatechnology/logger'
import { createRabbitMqProvider, type RabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import { parseWorkerEnvironment } from './config/environment.schema.js'
import { WorkerHealthService } from './health/health.service.js'
import { safeLogInfo } from './logging/safe-logger.service.js'
import {
  buildNfeDistributionRabbitMqTopology,
  buildNfeImportRabbitMqTopology,
} from './messaging/nfe-rabbitmq-topology.js'
import { buildRabbitMqTopology } from './messaging/rabbitmq-topology.js'
import { OutboxRelayLoop } from './outbox/application/outbox-relay-loop.service.js'
import { NfeOutboxPublisherService } from './outbox/application/nfe-outbox-publisher.service.js'
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
  const loggerFactory = dependencies.createLogger ?? createLogger
  const databaseFactory = dependencies.createDatabase ?? createDrizzleProvider
  const rabbitProviderFactory = dependencies.createRabbitMqProvider ?? createRabbitMqProvider
  const syntheticStarter =
    dependencies.startFoundationSyntheticConsumer ?? startFoundationSyntheticConsumer
  const importStarter = dependencies.startImportConsumer ?? startNfeImportConsumer
  const distributionStarter = dependencies.startDistributionConsumer ?? startNfeDistributionConsumer
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
  const database = databaseFactory({ connection: config.databaseUrl })
  const storageGateway = storageGatewayFactory({ environment })
  const syntheticTopology = buildRabbitMqTopology(`${config.queuePrefix}.synthetic.v1`)
  const nfeImportTopology = buildNfeImportRabbitMqTopology({
    queuePrefix: config.queuePrefix,
  })
  const nfeDistributionTopology = buildNfeDistributionRabbitMqTopology({
    queuePrefix: config.queuePrefix,
  })
  let provider: RabbitMqProvider | undefined
  let distributionPublisher: RabbitMqProvider | undefined
  let healthServer: RuntimeHealthServer | undefined
  let importConsumer: RuntimeConsumer | undefined
  let importPublisher: RabbitMqProvider | undefined
  let distributionConsumer: RuntimeConsumer | undefined
  let relayLoop: OutboxRelayLoop | undefined
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
    relayLoop = new OutboxRelayLoop({
      claimOwner: `${config.queuePrefix}.relay.${crypto.randomUUID()}`,
      intervalMs: 1_000,
      leaseMs: 30_000,
      limit: 25,
      logger,
      relay,
    })
    relayLoop.start()
    const shutdown = new WorkerShutdown({
      closeables: [relayLoop, storageGateway],
      consumers: [syntheticConsumer, importConsumer, distributionConsumer].filter(
        (consumer): consumer is RuntimeConsumer => consumer !== undefined,
      ),
      database,
      healthServer,
      provider: createCloseableGroup([provider, importPublisher, distributionPublisher]),
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
    await relayLoop?.close().catch(() => undefined)
    await healthServer?.stop().catch(() => undefined)
    await storageGateway.close().catch(() => undefined)
    await distributionPublisher?.close().catch(() => undefined)
    await importPublisher?.close().catch(() => undefined)
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
