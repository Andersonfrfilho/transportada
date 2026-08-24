/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createRabbitMqProvider } from '@adatechnology/rabbitmq-provider'

import type { CronJobDependencies } from '../config/cron.types.js'
import { createDrizzleAdvisoryLock } from '../shared/drizzle-advisory-lock.js'
import { runTickCycle, type TickCycleResult } from './application/run-tick.js'
import { createDrizzleJobScheduleRepository } from './infrastructure/drizzle-job-schedule.repository.js'
import { buildJobRunRabbitMqTopology } from './infrastructure/job-run-rabbitmq-topology.js'
import { createRabbitMqJobRunPublisher } from './infrastructure/rabbitmq-job-run.publisher.js'

export async function runTickJob(dependencies: CronJobDependencies): Promise<TickCycleResult> {
  const provider = await createRabbitMqProvider({
    connection: dependencies.config.rabbitMqUrl,
    topology: buildJobRunRabbitMqTopology({ queuePrefix: dependencies.config.queuePrefix }),
  })

  try {
    return await runTickCycle({
      correlationId: dependencies.correlationId,
      lock: createDrizzleAdvisoryLock({ db: dependencies.db }),
      logger: dependencies.logger,
      newEventId: () => crypto.randomUUID(),
      now: dependencies.now,
      publisher: createRabbitMqJobRunPublisher({ provider }),
      schedules: createDrizzleJobScheduleRepository({ db: dependencies.db }),
    })
  } finally {
    // Processo one-shot: sem fechar a conexão o contêiner fica de pé esperando o socket morrer.
    await provider.close()
  }
}
