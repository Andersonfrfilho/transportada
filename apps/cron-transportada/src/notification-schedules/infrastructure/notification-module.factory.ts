/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { QueuePort } from '@adatechnology/notification-contracts'
import {
  createNotificationModule,
  type NotificationModule,
} from '@adatechnology/notification-module'

import type { CronDatabase } from '../../database/cron-database.types.js'
import {
  NOTIFICATION_DEFAULT_LOCALE,
  NOTIFICATION_DEFAULT_TIMEZONE,
} from '../domain/notification-schedules.constant.js'
import { createIdentityRecipientResolver } from './identity-recipient.resolver.js'

type CreateScheduleNotificationModuleParams = {
  readonly db: CronDatabase
  readonly queue: QueuePort
  readonly suppressionHmacKey: string
}

/**
 * A fatia mais estreita das três: aqui o módulo só **agenda** — enfileira o que venceu, expira e
 * purga. Nenhum driver de canal, porque quem entrega é o worker; um canal configurado aqui faria
 * o mesmo e-mail sair por dois processos.
 */
export function createScheduleNotificationModule(
  params: CreateScheduleNotificationModuleParams,
): NotificationModule {
  return createNotificationModule({
    config: {
      defaultLocale: NOTIFICATION_DEFAULT_LOCALE,
      defaultTimezone: NOTIFICATION_DEFAULT_TIMEZONE,
      suppressionHmacKey: params.suppressionHmacKey,
    },
    db: params.db as never,
    features: {},
    providers: {
      queue: params.queue,
      recipientResolver: createIdentityRecipientResolver({ db: params.db }),
    },
  })
}
