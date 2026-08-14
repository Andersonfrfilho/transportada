/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createRabbitMqProvider } from '@adatechnology/rabbitmq-provider'
import { createNotificationSchedules } from '@adatechnology/notification-module'

import type { CronCycleResult, CronJobDependencies } from '../config/cron.types.js'
import { runNotificationSchedulesCycle } from './application/run-cycle.js'
import { CronConfigurationError } from '../config/environment.schema.js'
import { buildNotificationRabbitMqTopology } from './infrastructure/notification-rabbitmq-topology.js'
import { createScheduleNotificationModule } from './infrastructure/notification-module.factory.js'
import { createRabbitMqNotificationQueue } from './infrastructure/rabbitmq-notification-queue.adapter.js'

export async function runNotificationSchedulesJob(
  dependencies: CronJobDependencies,
): Promise<CronCycleResult> {
  const settings = dependencies.config.notificationSchedules
  // O schema já garante a configuração para este job; aqui é só o estreitamento de tipo.
  if (settings === undefined) throw new CronConfigurationError()

  const provider = await createRabbitMqProvider({
    connection: settings.rabbitMqUrl,
    topology: buildNotificationRabbitMqTopology({ queuePrefix: settings.queuePrefix }),
  })

  try {
    const module = createScheduleNotificationModule({
      db: dependencies.db,
      queue: createRabbitMqNotificationQueue({ logger: dependencies.logger, provider }),
      suppressionHmacKey: settings.suppressionHmacKey,
    })

    return await runNotificationSchedulesCycle({
      correlationId: dependencies.correlationId,
      jobId: dependencies.config.cronJob,
      logger: dependencies.logger,
      schedules: createNotificationSchedules(module),
    })
  } finally {
    // Processo one-shot: sem fechar a conexão o container fica de pé esperando o socket morrer.
    await provider.close()
  }
}
