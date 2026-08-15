/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Composição do ciclo de reconciliação de NFS-e: liga os adaptadores concretos ao orquestrador puro.
 * Uma instância segura o advisory lock, consulta a prefeitura por nota pendente e arquiva o
 * documento fiscal quando ela autoriza.
 *
 * Sem o bloco `nfseStatusPull` o job **não roda**: chaveiro, bucket e endereço da prefeitura são
 * pré-requisito, e meia configuração autorizaria nota sem XML guardado.
 */
import { createObjectStorageProvider } from '@adatechnology/object-storage-provider'
import { createRabbitMqProvider } from '@adatechnology/rabbitmq-provider'
import { createSecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import { CRON_MAX_FISCAL_DOCUMENT_BYTES } from '../config/cron.constant.js'
import type { CronCycleResult, CronJobDependencies } from '../config/cron.types.js'
import { parseCronSecretKeyRing } from '../config/cryptographic-configuration.schema.js'
import { CronConfigurationError } from '../config/environment.schema.js'
import { createDrizzleAdvisoryLock } from '../nfe-distribution-pull/infrastructure/drizzle-advisory-lock.js'
import { createNfseCredentialSecretService } from './application/nfse-credential-secret.service.js'
import { createReconcileInvoiceUseCase } from './application/reconcile-invoice.use-case.js'
import { runNfseStatusPullCycle } from './application/run-cycle.js'
import { createSelectDueInvoicesUseCase } from './application/select-due-invoices.use-case.js'
import {
  createDrizzleNfseReconciliationSource,
  createDrizzleNfseReconciliationWriteBack,
} from './infrastructure/drizzle-nfse-reconciliation.repository.js'
import { createNfseFiscalDocumentStorage } from './infrastructure/nfse-fiscal-document-storage.gateway.js'
import { createNfseFiscalGateway } from './infrastructure/nfse-fiscal-gateway.js'
import { createNfseRejectionNotifier } from './infrastructure/nfse-rejection-notifier.gateway.js'
import { createNotificationTrigger } from '../notification-schedules/application/notification-trigger.service.js'
import { buildNotificationRabbitMqTopology } from '../notification-schedules/infrastructure/notification-rabbitmq-topology.js'
import { createScheduleNotificationModule } from '../notification-schedules/infrastructure/notification-module.factory.js'
import { createRabbitMqNotificationQueue } from '../notification-schedules/infrastructure/rabbitmq-notification-queue.adapter.js'

const STORAGE_FORCE_PATH_STYLE = true

export async function runNfseStatusPullJob(
  dependencies: CronJobDependencies,
): Promise<CronCycleResult> {
  const settings = dependencies.config.nfseStatusPull
  if (settings === undefined) throw new CronConfigurationError()

  const storageProvider = createObjectStorageProvider({
    accessKeyId: settings.storage.accessKey,
    endpoint: new URL(settings.storage.endpoint),
    forcePathStyle: STORAGE_FORCE_PATH_STYLE,
    healthCheckBucket: settings.storage.bucket,
    maxObjectSizeBytes: CRON_MAX_FISCAL_DOCUMENT_BYTES,
    region: settings.storage.region,
    secretAccessKey: settings.storage.secretKey,
  })

  // O aviso é opcional por configuração: sem broker declarado, a reconciliação roda igual e calada.
  const notifications = dependencies.config.notificationSchedules
  const notificationProvider =
    notifications === undefined
      ? undefined
      : await createRabbitMqProvider({
          connection: notifications.rabbitMqUrl,
          topology: buildNotificationRabbitMqTopology({ queuePrefix: notifications.queuePrefix }),
        })

  try {
    const secretService = createNfseCredentialSecretService({
      envelopeProvider: createSecretEnvelopeProvider(
        parseCronSecretKeyRing({
          encryptionActiveKeyId: settings.encryptionActiveKeyId,
          encryptionKeyRingJson: settings.encryptionKeyRingJson,
        }),
      ),
    })

    const notificationModule =
      notifications === undefined || notificationProvider === undefined
        ? undefined
        : createScheduleNotificationModule({
            db: dependencies.db,
            queue: createRabbitMqNotificationQueue({
              logger: dependencies.logger,
              provider: notificationProvider,
            }),
            suppressionHmacKey: notifications.suppressionHmacKey,
          })
    const notifier =
      notificationModule === undefined
        ? undefined
        : createNfseRejectionNotifier({
            db: dependencies.db,
            trigger: createNotificationTrigger({
              logger: dependencies.logger,
              send: (params) => notificationModule.useCases.sendNotification.execute(params),
            }),
          })

    const reconcileUseCase = createReconcileInvoiceUseCase({
      ...(notifier === undefined ? {} : { notifier }),
      documentStorage: createNfseFiscalDocumentStorage({
        bucket: settings.storage.bucket,
        provider: storageProvider,
      }),
      logger: dependencies.logger,
      status: createNfseFiscalGateway({
        config: {
          baseUrl: settings.providerBaseUrl,
          timeoutMilliseconds: settings.providerTimeoutMilliseconds,
        },
        fetch: globalThis.fetch,
        secretService,
      }),
      writeBack: createDrizzleNfseReconciliationWriteBack({
        db: dependencies.db,
        storageProvider: settings.storage.provider,
      }),
    })

    return await runNfseStatusPullCycle({
      correlationId: dependencies.correlationId,
      environment: dependencies.config.fiscalEnvironment,
      jobId: dependencies.config.cronJob,
      lock: createDrizzleAdvisoryLock({ db: dependencies.db }),
      logger: dependencies.logger,
      now: dependencies.now,
      pageSize: dependencies.config.pageSize,
      reconcileUseCase,
      selectDueUseCase: createSelectDueInvoicesUseCase({
        logger: dependencies.logger,
        source: createDrizzleNfseReconciliationSource({
          db: dependencies.db,
          logger: dependencies.logger,
        }),
      }),
    })
  } finally {
    // O processo é one-shot: a conexão do bucket morre com ele, mas fechar aqui evita o socket
    // pendurado quando o ciclo termina antes do runtime.
    await storageProvider.close()
    await notificationProvider?.close()
  }
}
