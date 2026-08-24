/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createRabbitMqProvider } from '@adatechnology/rabbitmq-provider'
import { createNotificationSchedules } from '@adatechnology/notification-module'

import type { CronCycleResult, CronJobDependencies } from '../config/cron.types.js'
import { runNotificationSchedulesCycle } from './application/run-cycle.js'
import { NOTIFICATION_SCHEDULES_JOB } from './domain/notification-schedules.constant.js'
import { createNotificationTrigger } from './application/notification-trigger.service.js'
import { sweepDueInvoices } from './application/sweep-due-invoices.use-case.js'
import { createDueInvoicesQuery } from './infrastructure/drizzle-due-invoices.query.js'
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

    // Antes de despachar o que já venceu: a varredura é quem cria o aviso de fatura vencendo, e
    // a rotina de despacho do módulo, logo abaixo, o leva para a fila na mesma janela.
    await sweepDueInvoices({
      logger: dependencies.logger,
      now: new Date(),
      selectDueInvoices: createDueInvoicesQuery(dependencies.db),
      trigger: createNotificationTrigger({
        logger: dependencies.logger,
        send: (params) => module.useCases.sendNotification.execute(params),
      }),
    })

    return await runNotificationSchedulesCycle({
      correlationId: dependencies.correlationId,
      jobId: NOTIFICATION_SCHEDULES_JOB,
      logger: dependencies.logger,
      schedules: createNotificationSchedules(module),
    })
  } finally {
    // Processo one-shot: sem fechar a conexão o container fica de pé esperando o socket morrer.
    await provider.close()
  }
}
