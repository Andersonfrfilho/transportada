/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { createLogger } from '@adatechnology/logger'
import { createRabbitMqProvider, type RabbitMqProvider } from '@adatechnology/rabbitmq-provider'
import { createSmtpEmailProvider } from '@adatechnology/email-provider'
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
import { buildInvitationDeliveryRabbitMqTopology } from './messaging/invitation-delivery-rabbitmq-topology.js'
import { buildNotificationRabbitMqTopology } from './messaging/notification-rabbitmq-topology.js'
import { createRabbitMqNotificationQueue } from './messaging/rabbitmq-notification-queue.adapter.js'
import { createGuardedNotificationQueue } from './notification/infrastructure/guarded-notification-queue.adapter.js'
import { createWorkerNotificationModule } from './notification/infrastructure/notification-module.factory.js'
import { createCteBatchFailureQuery } from './notification/infrastructure/drizzle-cte-batch-failure.query.js'
import { createNotificationTrigger } from './notification/application/notification-trigger.service.js'
import { buildCteBatchFailureNotification } from './notification/domain/notification-trigger.policy.js'
import { startNotificationConsumer } from './runtime/notification-consumer.service.js'
import { InvitationDeliveryOutboxPublisherService } from './identity/application/invitation-delivery-outbox-publisher.service.js'
import { InvitationDeliveryOutboxRelayService } from './identity/application/invitation-delivery-outbox-relay.service.js'
import { DrizzleInvitationDeliveryOutboxRepository } from './identity/infrastructure/drizzle-invitation-delivery-outbox.repository.js'
import { DrizzleInvitationDeliveryRepository } from './identity/infrastructure/drizzle-invitation.repository.js'
import { createInvitationChannelGateway } from './identity/infrastructure/invitation-channel.gateway.js'
import { createInvitationCodeSecretGateway } from './identity/infrastructure/invitation-code-secret.gateway.js'
import type { InvitationDeliveryDependencies } from './identity/application/deliver-invitation-code.service.js'
import { startInvitationDeliveryConsumer } from './runtime/invitation-delivery-consumer.service.js'
import { buildPasswordResetDeliveryRabbitMqTopology } from './messaging/password-reset-delivery-rabbitmq-topology.js'
import { PasswordResetDeliveryOutboxPublisherService } from './identity/application/password-reset-delivery-outbox-publisher.service.js'
import { PasswordResetDeliveryOutboxRelayService } from './identity/application/password-reset-delivery-outbox-relay.service.js'
import { DrizzlePasswordResetDeliveryOutboxRepository } from './identity/infrastructure/drizzle-password-reset-delivery-outbox.repository.js'
import { DrizzlePasswordResetDeliveryRepository } from './identity/infrastructure/drizzle-password-reset-delivery.repository.js'
import { createPasswordResetCodeSecretGateway } from './identity/infrastructure/password-reset-code-secret.gateway.js'
import type { PasswordResetDeliveryDependencies } from './identity/application/deliver-password-reset-code.service.js'
import { startPasswordResetDeliveryConsumer } from './runtime/password-reset-delivery-consumer.service.js'
import { buildNfseIssuanceRabbitMqTopology } from './messaging/nfse-rabbitmq-topology.js'
import type { NfseProcessingEnvelopeV1 } from './messaging/nfse-processing-envelope.schema.js'
import { createNfseCredentialSecretService } from './nfse-issuance/application/nfse-credential-secret.service.js'
import { createNfseIssuanceWorkerEffect } from './nfse-issuance/application/nfse-issuance-consumer.effect.js'
import { NfseOutboxPublisherService } from './nfse-issuance/application/nfse-outbox-publisher.service.js'
import { NfseOutboxRelayService } from './nfse-issuance/application/nfse-outbox-relay.service.js'
import { DrizzleNfseIssuanceExecutionRepository } from './nfse-issuance/infrastructure/drizzle-nfse-issuance-execution.repository.js'
import { DrizzleNfseIssuanceWorkerRepository } from './nfse-issuance/infrastructure/drizzle-nfse-issuance-worker.repository.js'
import { DrizzleNfseIssuanceWriteBackRepository } from './nfse-issuance/infrastructure/drizzle-nfse-issuance-write-back.repository.js'
import { DrizzleNfseOutboxRepository } from './nfse-issuance/infrastructure/drizzle-nfse-outbox.repository.js'
import { DrizzleNfseRetryPolicyRepository } from './nfse-issuance/infrastructure/drizzle-nfse-retry-policy.repository.js'
import { createNfseFiscalGateway } from './nfse-issuance/infrastructure/nfse-fiscal-gateway.js'
import { startNfseIssuanceConsumer } from './runtime/nfse-issuance-consumer.service.js'
import { startJobRunConsumer } from './runtime/job-run-consumer.service.js'
import { createJobCycle, type JobCyclePort } from './job-run/application/run-job-cycle.js'
import { DrizzleJobExecutionRepository } from './job-run/infrastructure/drizzle-job-execution.repository.js'
import { buildJobRunRabbitMqTopology } from './messaging/job-run-rabbitmq-topology.js'
import { startFoundationSyntheticConsumer } from './runtime/foundation-synthetic-consumer.service.js'
import { startNfeDistributionConsumer } from './runtime/nfe-distribution-consumer.service.js'
import { createNfeDistributionConsumer } from './nfe-distribution/application/nfe-distribution-consumer.service.js'
import { createAdatechnologyNfeDistributionProvider } from './nfe-distribution/infrastructure/adatechnology-nfe-distribution-provider.factory.js'
import { createNfeDistributionGatewayFactory } from './nfe-distribution/infrastructure/nfe-distribution-gateway.js'
import { createNfeDistributionPersistenceAdapter } from './nfe-distribution/infrastructure/nfe-distribution-persistence.adapter.js'
import { DrizzleNfeDistributionCursorRepository } from './nfe-distribution/infrastructure/drizzle-nfe-distribution-cursor.repository.js'
import { DrizzleNfeDistributionProfileRepository } from './nfe-distribution/infrastructure/drizzle-nfe-distribution-profile.repository.js'
import { DrizzleNfeDistributionRepository } from './nfe-distribution/infrastructure/drizzle-nfe-distribution.repository.js'
import { createNfeDistributionPullRoutine } from './nfe-distribution-pull/application/nfe-distribution-pull.routine.js'
import { createNfseCredentialSecretService as createNfseStatusCredentialSecretService } from './nfse-issuance/application/nfse-credential-secret.service.js'
import { createReconcileInvoiceUseCase } from './nfse-status-pull/application/reconcile-invoice.use-case.js'
import { createSelectDueInvoicesUseCase } from './nfse-status-pull/application/select-due-invoices.use-case.js'
import { createNfseStatusPullRoutine } from './nfse-status-pull/application/nfse-status-pull.routine.js'
import {
  NFSE_STATUS_PULL_JOB,
  NFSE_STATUS_PULL_PAGE_SIZE,
} from './nfse-status-pull/domain/nfse-status-pull.constant.js'
import { createNotificationSchedulesRoutine } from './notification-schedules/application/notification-schedules.routine.js'
import { createSweepDueInvoices } from './notification-schedules/application/sweep-due-invoices.use-case.js'
import { NOTIFICATION_SCHEDULES_JOB } from './notification-schedules/domain/notification-schedules.constant.js'
import { createDueInvoicesQuery } from './notification-schedules/infrastructure/drizzle-due-invoices.query.js'
import {
  createDrizzleNfseReconciliationSource,
  createDrizzleNfseReconciliationWriteBack,
} from './nfse-status-pull/infrastructure/drizzle-nfse-reconciliation.repository.js'
import { createNfseFiscalDocumentStorage } from './nfse-status-pull/infrastructure/nfse-fiscal-document-storage.gateway.js'
import { createNfseFiscalStatusGateway } from './nfse-status-pull/infrastructure/nfse-fiscal-status.gateway.js'
import { DISTRIBUTION_PULL_JOB } from './nfe-distribution-pull/domain/distribution-pull.constant.js'
import { createCryptoDistributionIdentifiers } from './nfe-distribution-pull/infrastructure/crypto-identifiers.js'
import { createDrizzleDistributionCandidateSource } from './nfe-distribution-pull/infrastructure/drizzle-distribution-candidate.source.js'
import { createDrizzleDistributionEnqueueGateway } from './nfe-distribution-pull/infrastructure/drizzle-distribution-enqueue.gateway.js'
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
import { createDeferredShutdown } from './runtime/deferred-shutdown.service.js'
import { registerWorkerShutdownSignals } from './runtime/shutdown-signals.service.js'
import { WorkerShutdown } from './runtime/worker-shutdown.service.js'
import { startHealthServer } from './server/health-server.service.js'
import { DrizzleOutboxRepository } from './outbox/infrastructure/drizzle-outbox.repository.js'
import { OutboxRelayService } from './outbox/application/outbox-relay.service.js'
import {
  createNfeStorageGatewayFromEnvironment,
  type NfeStorageGateway,
} from './storage/infrastructure/nfe-storage-gateway.js'
import type { QueuePort } from '@adatechnology/notification-contracts'
import { createNotificationSchedules } from '@adatechnology/notification-module'
import type { NotificationModule } from '@adatechnology/notification-module'

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

/** Quem loga enxerga o `WorkerLogger` estreito; só o runtime precisa drenar o transporte HTTP. */
type RuntimeLogger = WorkerLogger & {
  flush(): Promise<void>
  stop(): void
}

type RuntimeLoggerFactory = (input: {
  readonly logLevel: ReturnType<typeof parseWorkerEnvironment>['logLevel']
  readonly pretty: boolean
  readonly projectName: string
  readonly sinkUrl?: string
  readonly version: string
}) => RuntimeLogger

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

type NfseIssuanceMessageKey = {
  readonly attemptId: string
  readonly companyId: string
  readonly eventId: string
  readonly invoiceId: string
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
  readonly startNfseIssuanceConsumer?: (input: {
    readonly config: ReturnType<typeof parseWorkerEnvironment>
    readonly effect: {
      execute(params: { readonly envelope: NfseProcessingEnvelopeV1 }): Promise<void>
    }
    readonly logger: WorkerLogger
    readonly provider: RabbitMqProvider
    readonly repository: {
      hasProcessed(input: NfseIssuanceMessageKey): Promise<boolean>
      markDeadLettered(input: NfseIssuanceMessageKey & { readonly reason: string }): Promise<void>
      markProcessed(input: NfseIssuanceMessageKey): Promise<void>
      scheduleRetry(input: NfseIssuanceMessageKey & { readonly nextAttemptAt: Date }): Promise<void>
    }
  }) => Promise<RuntimeConsumer | undefined>
  readonly startInvitationDeliveryConsumer?: (input: {
    readonly config: ReturnType<typeof parseWorkerEnvironment>
    readonly dependencies: InvitationDeliveryDependencies
    readonly logger: WorkerLogger
    readonly provider: RabbitMqProvider
  }) => Promise<RuntimeConsumer | undefined>
  readonly startPasswordResetDeliveryConsumer?: (input: {
    readonly config: ReturnType<typeof parseWorkerEnvironment>
    readonly dependencies: PasswordResetDeliveryDependencies
    readonly logger: WorkerLogger
    readonly provider: RabbitMqProvider
  }) => Promise<RuntimeConsumer | undefined>
  readonly startJobRunConsumer?: (input: {
    readonly config: ReturnType<typeof parseWorkerEnvironment>
    readonly cycle: JobCyclePort
    readonly logger: WorkerLogger
    readonly provider: RabbitMqProvider
  }) => Promise<RuntimeConsumer | undefined>
  readonly startNotificationConsumer?: (input: {
    readonly logger: WorkerLogger
    readonly module: NotificationModule
    readonly queue: QueuePort
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
  const nfseIssuanceStarter = dependencies.startNfseIssuanceConsumer ?? startNfseIssuanceConsumer
  const invitationDeliveryStarter =
    dependencies.startInvitationDeliveryConsumer ?? startInvitationDeliveryConsumer
  const passwordResetDeliveryStarter =
    dependencies.startPasswordResetDeliveryConsumer ?? startPasswordResetDeliveryConsumer
  const jobRunStarter = dependencies.startJobRunConsumer ?? startJobRunConsumer
  const notificationStarter = dependencies.startNotificationConsumer ?? startNotificationConsumer
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
    ...(config.logSinkUrl === undefined ? {} : { sinkUrl: config.logSinkUrl }),
    version: WORKER_VERSION,
  })
  // Antes de qualquer consumidor: entre o primeiro `consume` e o fim do boot há `await` de sobra
  // para o event loop entregar mensagem, e sinal que chegue nessa janela sem handler mata o
  // processo sem drenar o que está em voo.
  const runtimeShutdown = createDeferredShutdown()
  registerWorkerShutdownSignals({ logger, resolveShutdown: () => runtimeShutdown.promise })
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
  const nfseIssuanceTopology = buildNfseIssuanceRabbitMqTopology({
    queuePrefix: config.queuePrefix,
  })
  const invitationDeliveryTopology = buildInvitationDeliveryRabbitMqTopology({
    queuePrefix: config.queuePrefix,
  })
  const passwordResetDeliveryTopology = buildPasswordResetDeliveryRabbitMqTopology({
    queuePrefix: config.queuePrefix,
  })
  const jobRunTopology = buildJobRunRabbitMqTopology({
    queuePrefix: config.queuePrefix,
  })
  const notificationTopology = buildNotificationRabbitMqTopology({
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
  let nfseIssuanceConsumer: RuntimeConsumer | undefined
  let nfseIssuancePublisher: RabbitMqProvider | undefined
  let nfseRelayLoop: OutboxRelayLoop | undefined
  let invitationDeliveryConsumer: RuntimeConsumer | undefined
  let invitationDeliveryPublisher: RabbitMqProvider | undefined
  let invitationDeliveryRelayLoop: OutboxRelayLoop | undefined
  let passwordResetDeliveryConsumer: RuntimeConsumer | undefined
  let passwordResetDeliveryPublisher: RabbitMqProvider | undefined
  let passwordResetDeliveryRelayLoop: OutboxRelayLoop | undefined
  let syntheticConsumer: RuntimeConsumer | undefined
  let jobRunConsumer: RuntimeConsumer | undefined
  let jobRunProvider: RabbitMqProvider | undefined
  let notificationConsumer: RuntimeConsumer | undefined
  let notificationProvider: RabbitMqProvider | undefined

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
    nfseIssuancePublisher = await rabbitProviderFactory({
      connection: config.rabbitMqUrl,
      topology: nfseIssuanceTopology,
    })
    invitationDeliveryPublisher = await rabbitProviderFactory({
      connection: config.rabbitMqUrl,
      topology: invitationDeliveryTopology,
    })
    passwordResetDeliveryPublisher = await rabbitProviderFactory({
      connection: config.rabbitMqUrl,
      topology: passwordResetDeliveryTopology,
    })
    jobRunProvider = await rabbitProviderFactory({
      connection: config.rabbitMqUrl,
      topology: jobRunTopology,
    })
    notificationProvider = await rabbitProviderFactory({
      connection: config.rabbitMqUrl,
      topology: notificationTopology,
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
          logger,
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
    // A mesma instância vai para o módulo (que reenfileira a próxima tentativa) e para o worker
    // dele (que consome): duas seriam dois canais e um `close` que fecha só metade.
    const notificationQueue = createRabbitMqNotificationQueue({
      logger,
      provider: notificationProvider,
    })
    const notificationModule = createWorkerNotificationModule({
      db: database.db as ReturnType<typeof createDrizzleProvider>['db'],
      emailDelivery: config.emailDelivery,
      // A fila do módulo é a mesma do consumidor, envolvida: publicação que cai chega nomeada à
      // rotina agendada, que fecha a linha por `queue_unreachable` em vez de `unexpected_error`.
      queue: createGuardedNotificationQueue(notificationQueue),
      suppressionHmacKey: cryptography.notificationSuppressionHmacKey,
    })
    const loadCteBatchFailure = createCteBatchFailureQuery(
      database.db as ReturnType<typeof createDrizzleProvider>['db'],
    )
    const notificationTrigger = createNotificationTrigger({
      logger,
      send: (params) => notificationModule.useCases.sendNotification.execute(params),
    })
    const cteIssuanceWriteBack = new DrizzleCteIssuanceWriteBackRepository(
      database.db as ReturnType<typeof createDrizzleProvider>['db'],
      undefined,
      async ({ batchId, companyId, status }) => {
        if (status !== 'error') {
          return
        }

        const failure = await loadCteBatchFailure({ batchId, companyId })
        if (failure === undefined) {
          return
        }

        await notificationTrigger.notify(
          buildCteBatchFailureNotification({ batchId, companyId, ...failure }),
        )
      },
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
    const nfseIssuanceWriteBack = new DrizzleNfseIssuanceWriteBackRepository(
      database.db as ReturnType<typeof createDrizzleProvider>['db'],
    )
    nfseIssuanceConsumer = await nfseIssuanceStarter({
      config,
      effect: createNfseIssuanceWorkerEffect({
        executionInput: new DrizzleNfseIssuanceExecutionRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        gateway: createNfseFiscalGateway({
          config: config.nfseProvider,
          fetch: (input, init) => fetch(input, init),
          secretService: createNfseCredentialSecretService({
            envelopeProvider: createSecretEnvelopeProvider(cryptography.envelopeKeyRing),
          }),
        }),
        writeBack: nfseIssuanceWriteBack,
      }),
      logger,
      provider: nfseIssuancePublisher,
      repository: new DrizzleNfseIssuanceWorkerRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
        nfseIssuanceWriteBack,
      ),
      retryPolicyResolver: new DrizzleNfseRetryPolicyRepository(
        database.db as ReturnType<typeof createDrizzleProvider>['db'],
      ),
    })
    invitationDeliveryConsumer = await invitationDeliveryStarter({
      config,
      dependencies: {
        // Sem SMTP configurado o canal não tem driver e a entrega falha alto: melhor a mensagem
        // parar no trilho de retry do que o convite ser dado como entregue sem ter saído daqui.
        channels: createInvitationChannelGateway(
          config.emailDelivery === undefined
            ? {}
            : {
                email: createSmtpEmailProvider({
                  from: config.emailDelivery.from,
                  smtpUrl: config.emailDelivery.smtpUrl,
                }),
              },
        ),
        envelopeProvider: createInvitationCodeSecretGateway({
          envelopeProvider: createSecretEnvelopeProvider(cryptography.envelopeKeyRing),
        }),
        invitations: new DrizzleInvitationDeliveryRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        logger,
      },
      logger,
      provider: invitationDeliveryPublisher,
    })
    passwordResetDeliveryConsumer = await passwordResetDeliveryStarter({
      config,
      dependencies: {
        // Mesmo arranjo do convite: sem SMTP configurado a entrega falha alto, e o código continua
        // válido para reenvio — quem falhou foi o transporte.
        channels: createInvitationChannelGateway(
          config.emailDelivery === undefined
            ? {}
            : {
                email: createSmtpEmailProvider({
                  from: config.emailDelivery.from,
                  smtpUrl: config.emailDelivery.smtpUrl,
                }),
              },
        ),
        envelopeProvider: createPasswordResetCodeSecretGateway({
          envelopeProvider: createSecretEnvelopeProvider(cryptography.envelopeKeyRing),
        }),
        logger,
        resets: new DrizzlePasswordResetDeliveryRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
      },
      logger,
      provider: passwordResetDeliveryPublisher,
    })
    jobRunConsumer = await jobRunStarter({
      config,
      // Registro parcial de propósito: as quatro rotinas entram uma a uma, e a que ainda não entrou
      // fecha a linha em `unexpected_error` em vez de deixá-la aberta.
      cycle: createJobCycle({
        executions: new DrizzleJobExecutionRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        logger,
        now: () => new Date(),
        routines: {
          [DISTRIBUTION_PULL_JOB]: createNfeDistributionPullRoutine({
            gateway: createDrizzleDistributionEnqueueGateway({
              database: database.db as ReturnType<typeof createDrizzleProvider>['db'],
            }),
            identifiers: createCryptoDistributionIdentifiers(),
            logger,
            now: () => new Date(),
            source: createDrizzleDistributionCandidateSource({
              database: database.db as ReturnType<typeof createDrizzleProvider>['db'],
              logger,
            }),
          }),
          // Sem aviso de rejeição enquanto `notification.schedules.run` não se mudar para cá: a
          // porta é opcional de propósito, e a reconciliação fiscal não depende do aviso existir.
          [NFSE_STATUS_PULL_JOB]: createNfseStatusPullRoutine({
            fiscalEnvironment: config.fiscalEnvironment,
            logger,
            now: () => new Date(),
            pageSize: NFSE_STATUS_PULL_PAGE_SIZE,
            reconcile: createReconcileInvoiceUseCase({
              documentStorage: createNfseFiscalDocumentStorage({
                bucket: storageBucket,
                provider: {
                  put: (input) =>
                    storageGateway.storeObject({
                      body: input.body,
                      bucket: input.bucket,
                      contentLength: input.contentLength,
                      contentType: input.contentType,
                      key: input.key,
                      sha256: input.sha256,
                    }),
                },
              }),
              logger,
              status: createNfseFiscalStatusGateway({
                config: config.nfseProvider,
                fetch: (input, init) => fetch(input, init),
                secretService: createNfseStatusCredentialSecretService({
                  envelopeProvider: createSecretEnvelopeProvider(cryptography.envelopeKeyRing),
                }),
              }),
              writeBack: createDrizzleNfseReconciliationWriteBack({
                db: database.db as ReturnType<typeof createDrizzleProvider>['db'],
              }),
            }),
            selectDue: createSelectDueInvoicesUseCase({
              logger,
              source: createDrizzleNfseReconciliationSource({
                db: database.db as ReturnType<typeof createDrizzleProvider>['db'],
                logger,
              }),
            }),
          }),
          [NOTIFICATION_SCHEDULES_JOB]: createNotificationSchedulesRoutine({
            logger,
            now: () => new Date(),
            schedules: createNotificationSchedules(notificationModule),
            sweep: createSweepDueInvoices({
              logger,
              selectDueInvoices: createDueInvoicesQuery(
                database.db as ReturnType<typeof createDrizzleProvider>['db'],
              ),
              send: (params) => notificationModule.useCases.sendNotification.execute(params),
            }),
          }),
        },
      }),
      logger,
      provider: jobRunProvider,
    })
    notificationConsumer = await notificationStarter({
      logger,
      module: notificationModule,
      queue: notificationQueue,
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
    nfseRelayLoop = new OutboxRelayLoop({
      claimOwner: `${config.queuePrefix}.nfse.relay.${crypto.randomUUID()}`,
      failureMessage: 'nfse_outbox_relay_failed',
      intervalMs: 1_000,
      leaseMs: 30_000,
      limit: 25,
      logger,
      relay: new NfseOutboxRelayService({
        clock: { now: () => new Date() },
        publisher: new NfseOutboxPublisherService(nfseIssuancePublisher),
        repository: new DrizzleNfseOutboxRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        retryPolicy: {
          classify(error: unknown): never {
            throw error instanceof Error ? error : new Error('NFS-e outbox relay publish failed')
          },
        },
      }),
    })
    nfseRelayLoop.start()
    invitationDeliveryRelayLoop = new OutboxRelayLoop({
      claimOwner: `${config.queuePrefix}.invitation-delivery.relay.${crypto.randomUUID()}`,
      failureMessage: 'invitation_delivery_outbox_relay_failed',
      intervalMs: 1_000,
      leaseMs: 30_000,
      limit: 25,
      logger,
      relay: new InvitationDeliveryOutboxRelayService({
        clock: { now: () => new Date() },
        publisher: new InvitationDeliveryOutboxPublisherService(invitationDeliveryPublisher),
        repository: new DrizzleInvitationDeliveryOutboxRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        retryPolicy: {
          classify(error: unknown): never {
            throw error instanceof Error
              ? error
              : new Error('Invitation delivery outbox relay publish failed')
          },
        },
      }),
    })
    invitationDeliveryRelayLoop.start()
    passwordResetDeliveryRelayLoop = new OutboxRelayLoop({
      claimOwner: `${config.queuePrefix}.password-reset-delivery.relay.${crypto.randomUUID()}`,
      failureMessage: 'password_reset_delivery_outbox_relay_failed',
      intervalMs: 1_000,
      leaseMs: 30_000,
      limit: 25,
      logger,
      relay: new PasswordResetDeliveryOutboxRelayService({
        clock: { now: () => new Date() },
        publisher: new PasswordResetDeliveryOutboxPublisherService(passwordResetDeliveryPublisher),
        repository: new DrizzlePasswordResetDeliveryOutboxRepository(
          database.db as ReturnType<typeof createDrizzleProvider>['db'],
        ),
        retryPolicy: {
          classify(error: unknown): never {
            throw error instanceof Error
              ? error
              : new Error('Password reset delivery outbox relay publish failed')
          },
        },
      }),
    })
    passwordResetDeliveryRelayLoop.start()
    const shutdown = new WorkerShutdown({
      closeables: [
        relayLoop,
        cteRelayLoop,
        mdfeRelayLoop,
        nfseRelayLoop,
        invitationDeliveryRelayLoop,
        passwordResetDeliveryRelayLoop,
        storageGateway,
        // Últimos a fechar: o desligamento gracioso é a chance final de drenar o que saiu do
        // processo pela rede. Depois deles não há mais para onde mandar nada.
        { close: (): Promise<void> => errorTracker.flush() },
        {
          async close(): Promise<void> {
            await logger.flush()
            logger.stop()
          },
        },
      ],
      consumers: [
        syntheticConsumer,
        importConsumer,
        distributionConsumer,
        cteIssuanceConsumer,
        mdfeIssuanceConsumer,
        nfseIssuanceConsumer,
        invitationDeliveryConsumer,
        passwordResetDeliveryConsumer,
        jobRunConsumer,
        notificationConsumer,
      ].filter((consumer): consumer is RuntimeConsumer => consumer !== undefined),
      database,
      healthServer,
      provider: createCloseableGroup([
        provider,
        importPublisher,
        distributionPublisher,
        cteIssuancePublisher,
        mdfeIssuancePublisher,
        nfseIssuancePublisher,
        invitationDeliveryPublisher,
        passwordResetDeliveryPublisher,
        jobRunProvider,
        notificationProvider,
      ]),
    })
    runtimeShutdown.resolve(shutdown)
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
    await nfseIssuanceConsumer?.cancel().catch(() => undefined)
    await invitationDeliveryConsumer?.cancel().catch(() => undefined)
    await invitationDeliveryRelayLoop?.close().catch(() => undefined)
    await passwordResetDeliveryConsumer?.cancel().catch(() => undefined)
    await passwordResetDeliveryRelayLoop?.close().catch(() => undefined)
    await jobRunConsumer?.cancel().catch(() => undefined)
    await relayLoop?.close().catch(() => undefined)
    await cteRelayLoop?.close().catch(() => undefined)
    await mdfeRelayLoop?.close().catch(() => undefined)
    await nfseRelayLoop?.close().catch(() => undefined)
    await healthServer?.stop().catch(() => undefined)
    await storageGateway.close().catch(() => undefined)
    await distributionPublisher?.close().catch(() => undefined)
    await importPublisher?.close().catch(() => undefined)
    await cteIssuancePublisher?.close().catch(() => undefined)
    await mdfeIssuancePublisher?.close().catch(() => undefined)
    await nfseIssuancePublisher?.close().catch(() => undefined)
    await invitationDeliveryPublisher?.close().catch(() => undefined)
    await passwordResetDeliveryPublisher?.close().catch(() => undefined)
    await jobRunProvider?.close().catch(() => undefined)
    await provider?.close().catch(() => undefined)
    await database.close().catch(() => undefined)
    // Sinal que chegou no meio do boot está esperando o desligamento existir. Ele não vai existir.
    runtimeShutdown.reject(error)
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
