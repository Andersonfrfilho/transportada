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
import { shouldPrettyPrintLogs } from './logging/log-format.policy.js'
import { safeLogInfo } from './logging/safe-logger.service.js'
import {
  buildNfeDistributionRabbitMqTopology,
  buildNfeImportRabbitMqTopology,
} from './messaging/nfe-rabbitmq-topology.js'
import { buildCteIssuanceRabbitMqTopology } from './messaging/cte-rabbitmq-topology.js'
import type { CteProcessingEnvelopeV1 } from './messaging/cte-processing-envelope.schema.js'
import type { MdfeProcessingEnvelopeV1 } from './messaging/mdfe-processing-envelope.schema.js'
import { buildRabbitMqTopology } from './messaging/rabbitmq-topology.js'
import { OutboxRelayLoop } from './outbox/application/outbox-relay-loop.service.js'
import { NfeOutboxPublisherService } from './outbox/application/nfe-outbox-publisher.service.js'
import { DrizzleCteOutboxRepository } from './cte-issuance/infrastructure/drizzle-cte-outbox.repository.js'
import { createDigitalCertificateSecretService } from './cte-issuance/application/digital-certificate-secret.service.js'
import { createCteCancellationInputResolver } from './cte-issuance/application/cte-cancellation-input-resolver.service.js'
import { createCteIssuanceExecutionInputResolver } from './cte-issuance/application/cte-issuance-execution-input-resolver.service.js'
import { DrizzleCteIssuanceWorkerRepository } from './cte-issuance/infrastructure/drizzle-cte-issuance-worker.repository.js'
import { DrizzleCteSettledAttemptRepository } from './cte-issuance/infrastructure/drizzle-cte-settled-attempt.repository.js'
import { DrizzleCteCancellationTargetRepository } from './cte-issuance/infrastructure/drizzle-cte-cancellation-target.repository.js'
import { DrizzleCteCertificateRepository } from './cte-issuance/infrastructure/drizzle-cte-certificate.repository.js'
import { DrizzleCteIssuancePayloadRepository } from './cte-issuance/infrastructure/drizzle-cte-issuance-payload.repository.js'
import { DrizzleCteRetryPolicyRepository } from './cte-issuance/infrastructure/drizzle-cte-retry-policy.repository.js'
import { createCteFiscalDocumentStorage } from './cte-issuance/infrastructure/cte-fiscal-document-storage.gateway.js'
import { DrizzleCteIssuanceWriteBackRepository } from './cte-issuance/infrastructure/drizzle-cte-issuance-write-back.repository.js'
import { createAdatechnologyCteFiscalProvider } from './cte-issuance/infrastructure/adatechnology-cte-fiscal-provider.factory.js'
import { CteOutboxPublisherService } from './cte-issuance/application/cte-outbox-publisher.service.js'
import { CteOutboxRelayService } from './cte-issuance/application/cte-outbox-relay.service.js'
import { createCteIssuanceWorkerEffect } from './cte-issuance/application/cte-issuance-consumer.effect.js'
import { DrizzleCteFiscalNumberProbeRepository } from './cte-issuance/infrastructure/drizzle-cte-fiscal-number-probe.repository.js'
import { DrizzleCteIssuanceDiagnosticsRepository } from './cte-issuance/infrastructure/drizzle-cte-issuance-diagnostics.repository.js'
import { startCteIssuanceConsumer } from './runtime/cte-issuance-consumer.service.js'
import { buildMdfeIssuanceRabbitMqTopology } from './messaging/mdfe-rabbitmq-topology.js'
import { createAdatechnologyMdfeFiscalProvider } from './mdfe-issuance/infrastructure/adatechnology-mdfe-fiscal-provider.factory.js'
import { DrizzleMdfeOutboxRepository } from './mdfe-issuance/infrastructure/drizzle-mdfe-outbox.repository.js'
import { DrizzleMdfeCertificateRepository } from './mdfe-issuance/infrastructure/drizzle-mdfe-certificate.repository.js'
import { DrizzleMdfeEventTargetRepository } from './mdfe-issuance/infrastructure/drizzle-mdfe-event-target.repository.js'
import { DrizzleMdfeIssuancePayloadRepository } from './mdfe-issuance/infrastructure/drizzle-mdfe-issuance-payload.repository.js'
import { DrizzleMdfeIssuanceWorkerRepository } from './mdfe-issuance/infrastructure/drizzle-mdfe-issuance-worker.repository.js'
import { DrizzleMdfeIssuanceWriteBackRepository } from './mdfe-issuance/infrastructure/drizzle-mdfe-issuance-write-back.repository.js'
import { DrizzleMdfeRetryPolicyRepository } from './mdfe-issuance/infrastructure/drizzle-mdfe-retry-policy.repository.js'
import { DrizzleMdfeSettledAttemptRepository } from './mdfe-issuance/infrastructure/drizzle-mdfe-settled-attempt.repository.js'
import { createMdfeFiscalDocumentStorage } from './mdfe-issuance/infrastructure/mdfe-fiscal-document-storage.gateway.js'
import { createMdfeCancellationInputResolver } from './mdfe-issuance/application/mdfe-cancellation-input-resolver.service.js'
import { createMdfeClosureInputResolver } from './mdfe-issuance/application/mdfe-closure-input-resolver.service.js'
import { createMdfeIssuanceExecutionInputResolver } from './mdfe-issuance/application/mdfe-issuance-execution-input-resolver.service.js'
import { createMdfeIssuanceWorkerEffect } from './mdfe-issuance/application/mdfe-issuance-consumer.effect.js'
import { MdfeOutboxPublisherService } from './mdfe-issuance/application/mdfe-outbox-publisher.service.js'
import { MdfeOutboxRelayService } from './mdfe-issuance/application/mdfe-outbox-relay.service.js'
import { startMdfeIssuanceConsumer } from './runtime/mdfe-issuance-consumer.service.js'
import { startFoundationSyntheticConsumer } from './runtime/foundation-synthetic-consumer.service.js'
import { startNfeDistributionConsumer } from './runtime/nfe-distribution-consumer.service.js'
import { createNfeDistributionConsumer } from './nfe-distribution/application/nfe-distribution-consumer.service.js'
import { createAdatechnologyNfeDistributionProvider } from './nfe-distribution/infrastructure/adatechnology-nfe-distribution-provider.factory.js'
import { createNfeDistributionGatewayFactory } from './nfe-distribution/infrastructure/nfe-distribution-gateway.js'
import { createNfeDistributionPersistenceAdapter } from './nfe-distribution/infrastructure/nfe-distribution-persistence.adapter.js'
import { DrizzleNfeDistributionCursorRepository } from './nfe-distribution/infrastructure/drizzle-nfe-distribution-cursor.repository.js'
import { DrizzleNfeDistributionProfileRepository } from './nfe-distribution/infrastructure/drizzle-nfe-distribution-profile.repository.js'
import { DrizzleNfeDistributionRepository } from './nfe-distribution/infrastructure/drizzle-nfe-distribution.repository.js'
import { startNfeImportConsumer } from './runtime/nfe-import-consumer.service.js'
import { createNfeImportConsumer } from './nfe-imports/application/nfe-import-consumer.service.js'
import type {
  NfeImportWorkerEffect,
  NfeImportWorkerRepository,
} from './nfe-imports/application/nfe-import-worker-message-handler.service.js'
import { createNfeImportArchiveExpander } from './nfe-imports/infrastructure/nfe-import-archive-expander.gateway.js'
import {
  createNfeImportFinalStorage,
  createNfeImportSourceStorage,
} from './nfe-imports/infrastructure/nfe-import-storage.gateway.js'
import { createNfeXmlImporter } from './nfe-imports/infrastructure/nfe-xml-importer.gateway.js'
import { DrizzleNfeImportConsumerRepository } from './nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'
import { DrizzleNfeImportWorkerRepository } from './nfe-imports/infrastructure/drizzle-nfe-import-worker.repository.js'
import { createErrorTracker } from './observability/sentry.service.js'
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

const NFE_DISTRIBUTION_LEASE_MS = 30_000
const WORKER_PROJECT_NAME = 'transportada-worker'
const WORKER_VERSION = '0.1.0'

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

type MdfeIssuanceMessageKey = {
  readonly attemptId: string
  readonly companyId: string
  readonly eventId: string
  readonly manifestId: string
}

type WorkerRuntimeDependencies = {
  readonly createDatabase?: RuntimeDatabaseFactory
  readonly createLogger?: RuntimeLoggerFactory
  readonly createRabbitMqProvider?: RuntimeRabbitMqProviderFactory
  readonly createStorageGateway?: (input: {
    readonly environment: Record<string, string | undefined>
  }) => NfeStorageGateway
  readonly startDistributionConsumer?: (input: {
    readonly config: ReturnType<typeof parseWorkerEnvironment>
    readonly consumer?: NfeImportWorkerEffect
    readonly logger: WorkerLogger
    readonly provider: RabbitMqProvider
    readonly repository?: NfeImportWorkerRepository
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
  readonly startMdfeIssuanceConsumer?: (input: {
    readonly config: ReturnType<typeof parseWorkerEnvironment>
    readonly effect: {
      execute(params: { readonly envelope: MdfeProcessingEnvelopeV1 }): Promise<void>
    }
    readonly logger: WorkerLogger
    readonly provider: RabbitMqProvider
    readonly repository: {
      hasProcessed(input: MdfeIssuanceMessageKey): Promise<boolean>
      markDeadLettered(input: MdfeIssuanceMessageKey & { readonly reason: string }): Promise<void>
      markProcessed(input: MdfeIssuanceMessageKey): Promise<void>
      scheduleRetry(
        input: MdfeIssuanceMessageKey & { readonly attempt: number; readonly nextAttemptAt: Date },
      ): Promise<void>
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
    readonly effect: NfeImportWorkerEffect
    readonly logger: WorkerLogger
    readonly provider: RabbitMqProvider
    readonly repository: NfeImportWorkerRepository
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
  const mdfeIssuanceStarter = dependencies.startMdfeIssuanceConsumer ?? startMdfeIssuanceConsumer
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
    pretty: shouldPrettyPrintLogs(config.appEnv),
    projectName: WORKER_PROJECT_NAME,
    version: WORKER_VERSION,
  })
  const errorTracker = createErrorTracker({
    configuration: {
      dsn: config.sentryDsn,
      environment: config.sentryEnvironment,
      release: `${WORKER_PROJECT_NAME}@${WORKER_VERSION}`,
    },
  })
  const digitalCertificateSecretService = createDigitalCertificateSecretService({
    envelopeProvider: createSecretEnvelopeProvider(cryptography.envelopeKeyRing),
  })
  const database = databaseFactory({ connection: config.databaseUrl })
  const storageGateway = storageGatewayFactory({ environment })
  const storageBucket =
    environment.OBJECT_STORAGE_BUCKET ?? environment.STORAGE_BUCKET ?? 'transportada-private'
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
  const mdfeIssuanceTopology = buildMdfeIssuanceRabbitMqTopology({
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
  let mdfeIssuanceConsumer: RuntimeConsumer | undefined
  let mdfeIssuancePublisher: RabbitMqProvider | undefined
  let mdfeRelayLoop: OutboxRelayLoop | undefined
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
    mdfeIssuancePublisher = await rabbitProviderFactory({
      connection: config.rabbitMqUrl,
      topology: mdfeIssuanceTopology,
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
      effect: createNfeImportConsumer({
        archiveExpander: createNfeImportArchiveExpander(),
        finalStorage: createNfeImportFinalStorage({
          bucket: storageBucket,
          gateway: storageGateway,
        }),
        repository: new DrizzleNfeImportConsumerRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        sourceStorage: createNfeImportSourceStorage({
          bucket: storageBucket,
          gateway: storageGateway,
        }),
        xmlImporter: createNfeXmlImporter(),
      }),
      logger,
      provider: importPublisher,
      repository: new DrizzleNfeImportWorkerRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
      ),
    })
    distributionConsumer = await distributionStarter({
      config,
      consumer: createNfeDistributionConsumer({
        clock: { now: () => new Date() },
        cursorRepository: new DrizzleNfeDistributionCursorRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        gatewayFactory: createNfeDistributionGatewayFactory({
          createProvider: createAdatechnologyNfeDistributionProvider(),
        }),
        leaseMs: NFE_DISTRIBUTION_LEASE_MS,
        logger,
        profile: new DrizzleNfeDistributionProfileRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
          { secretService: digitalCertificateSecretService },
        ),
        repository: createNfeDistributionPersistenceAdapter({
          finalStorage: createNfeImportFinalStorage({
            bucket: storageBucket,
            gateway: storageGateway,
          }),
          repository: new DrizzleNfeDistributionRepository(
            database.db as ReturnType<typeof createDrizzleProvider>['db'],
          ),
          xmlImporter: createNfeXmlImporter(),
        }),
      }),
      logger,
      provider: distributionPublisher,
      repository: new DrizzleNfeImportWorkerRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
      ),
    })
    const cteIssuanceWriteBack = new DrizzleCteIssuanceWriteBackRepository(
      database.db as ReturnType<typeof createDrizzleProvider>['db'],
    )
    const cteFiscalDocumentStorage = createCteFiscalDocumentStorage({
      bucket: storageBucket,
      gateway: storageGateway,
    })
    cteIssuanceConsumer = await cteIssuanceStarter({
      config,
      effect: createCteIssuanceWorkerEffect({
        authorizedDocumentStorage: cteFiscalDocumentStorage,
        cancellationDocumentStorage: cteFiscalDocumentStorage,
        createProvider: createAdatechnologyCteFiscalProvider,
        diagnostics: new DrizzleCteIssuanceDiagnosticsRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        fiscalNumberProbe: new DrizzleCteFiscalNumberProbeRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        logger,
        settledAttemptGuard: new DrizzleCteSettledAttemptRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        resolveCancellationInput: createCteCancellationInputResolver({
          certificateRepository: new DrizzleCteCertificateRepository(
            database.db as ReturnType<typeof createDrizzleProvider>['db'],
          ),
          payloadRepository: new DrizzleCteIssuancePayloadRepository(
            database.db as ReturnType<typeof createDrizzleProvider>['db'],
          ),
          secretService: digitalCertificateSecretService,
          targetRepository: new DrizzleCteCancellationTargetRepository(
            database.db as ReturnType<typeof createDrizzleProvider>['db'],
          ),
        }),
        resolveExecutionInput: createCteIssuanceExecutionInputResolver({
          certificateRepository: new DrizzleCteCertificateRepository(
            database.db as ReturnType<typeof createDrizzleProvider>['db'],
          ),
          payloadRepository: new DrizzleCteIssuancePayloadRepository(
            database.db as ReturnType<typeof createDrizzleProvider>['db'],
          ),
          secretService: digitalCertificateSecretService,
          ...(config.cteTechnicalResponsible === undefined
            ? {}
            : { technicalResponsible: config.cteTechnicalResponsible }),
        }),
        writeBack: cteIssuanceWriteBack,
      }),
      logger,
      provider: cteIssuancePublisher,
      repository: new DrizzleCteIssuanceWorkerRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
        cteIssuanceWriteBack,
      ),
      retryPolicyResolver: new DrizzleCteRetryPolicyRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
      ),
    })
    const mdfeIssuanceWriteBack = new DrizzleMdfeIssuanceWriteBackRepository(
      database.db as ReturnType<typeof createDrizzleProvider>['db'],
    )
    const mdfeFiscalDocumentStorage = createMdfeFiscalDocumentStorage({
      bucket: storageBucket,
      gateway: storageGateway,
    })
    const mdfeEventResolverDependencies = {
      certificateRepository: new DrizzleMdfeCertificateRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
      ),
      eventTargetRepository: new DrizzleMdfeEventTargetRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
      ),
      payloadRepository: new DrizzleMdfeIssuancePayloadRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
      ),
      secretService: digitalCertificateSecretService,
    }
    mdfeIssuanceConsumer = await mdfeIssuanceStarter({
      config,
      effect: createMdfeIssuanceWorkerEffect({
        authorizedDocumentStorage: mdfeFiscalDocumentStorage,
        createProvider: createAdatechnologyMdfeFiscalProvider,
        eventDocumentStorage: mdfeFiscalDocumentStorage,
        logger,
        resolveCancellationInput: createMdfeCancellationInputResolver(
          mdfeEventResolverDependencies,
        ),
        resolveClosureInput: createMdfeClosureInputResolver(mdfeEventResolverDependencies),
        resolveExecutionInput: createMdfeIssuanceExecutionInputResolver(
          mdfeEventResolverDependencies,
        ),
        settledAttemptGuard: new DrizzleMdfeSettledAttemptRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        writeBack: mdfeIssuanceWriteBack,
      }),
      logger,
      provider: mdfeIssuancePublisher,
      repository: new DrizzleMdfeIssuanceWorkerRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
        mdfeIssuanceWriteBack,
      ),
      retryPolicyResolver: new DrizzleMdfeRetryPolicyRepository(
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
    mdfeRelayLoop = new OutboxRelayLoop({
      claimOwner: `${config.queuePrefix}.mdfe.relay.${crypto.randomUUID()}`,
      failureMessage: 'mdfe_outbox_relay_failed',
      intervalMs: 1_000,
      leaseMs: 30_000,
      limit: 25,
      logger,
      relay: new MdfeOutboxRelayService({
        clock: { now: () => new Date() },
        publisher: new MdfeOutboxPublisherService(mdfeIssuancePublisher),
        repository: new DrizzleMdfeOutboxRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        retryPolicy: {
          classify(error: unknown): never {
            throw error instanceof Error ? error : new Error('MDF-e outbox relay publish failed')
          },
        },
      }),
    })
    mdfeRelayLoop.start()
    const shutdown = new WorkerShutdown({
      closeables: [
        relayLoop,
        cteRelayLoop,
        mdfeRelayLoop,
        storageGateway,
        // Último a fechar: o desligamento gracioso é a chance final de drenar o rastreio.
        { close: (): Promise<void> => errorTracker.flush() },
      ],
      consumers: [
        syntheticConsumer,
        importConsumer,
        distributionConsumer,
        cteIssuanceConsumer,
        mdfeIssuanceConsumer,
      ].filter((consumer): consumer is RuntimeConsumer => consumer !== undefined),
      database,
      healthServer,
      provider: createCloseableGroup([
        provider,
        importPublisher,
        distributionPublisher,
        cteIssuancePublisher,
        mdfeIssuancePublisher,
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
    await mdfeIssuanceConsumer?.cancel().catch(() => undefined)
    await relayLoop?.close().catch(() => undefined)
    await cteRelayLoop?.close().catch(() => undefined)
    await mdfeRelayLoop?.close().catch(() => undefined)
    await healthServer?.stop().catch(() => undefined)
    await storageGateway.close().catch(() => undefined)
    await distributionPublisher?.close().catch(() => undefined)
    await importPublisher?.close().catch(() => undefined)
    await cteIssuancePublisher?.close().catch(() => undefined)
    await mdfeIssuancePublisher?.close().catch(() => undefined)
    await provider?.close().catch(() => undefined)
    await database.close().catch(() => undefined)
    // Worker que não sobe não tem consumidor para reportar a falha por ele.
    errorTracker.captureException(error)
    await errorTracker.flush()
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
