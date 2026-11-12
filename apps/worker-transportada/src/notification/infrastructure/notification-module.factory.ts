/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { QueuePort } from '@adatechnology/notification-contracts'
import {
  createNotificationModule,
  type NotificationModule,
} from '@adatechnology/notification-module'

import {
  NOTIFICATION_DEFAULT_LOCALE,
  NOTIFICATION_DEFAULT_TIMEZONE,
} from '../notification.constant.js'
import { createIdentityRecipientResolver } from './identity-recipient.resolver.js'
import type { EmailDeliveryEnvironment } from '../../shared/worker.types.js'
import { createWorkerEmailDriver } from './email-driver.factory.js'
import { createWebPushProvider } from '@adatechnology/push-provider'

import {
  createStandardEmailBrandingResolver,
  withStandardEmailLayout,
} from './standard-email-layout.driver.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type CreateWorkerNotificationModuleParams = {
  readonly db: Database
  readonly emailDelivery: EmailDeliveryEnvironment | undefined
  readonly queue: QueuePort
  readonly suppressionHmacKey: string
  /** Ausente, o push fica sem driver: a entrega falha alto (`channel_not_configured`) em vez de sumir. */
  readonly vapid?: {
    readonly privateKey: string
    readonly publicKey: string
    readonly subject: string
  }
}

/**
 * O módulo aqui é a metade que **entrega**: nenhuma rota HTTP, nenhum cache de nonce de webhook —
 * só o driver de canal, o destinatário e a fila. Sem SMTP o canal de e-mail fica sem driver, e a
 * entrega falha alto em vez de ser dada como enviada.
 */
export function createWorkerNotificationModule(
  params: CreateWorkerNotificationModuleParams,
): NotificationModule {
  const emailDriver =
    params.emailDelivery === undefined
      ? undefined
      : withStandardEmailLayout({
          driver: createWorkerEmailDriver(params.emailDelivery),
          resolveBranding: createStandardEmailBrandingResolver(params.db),
        })

  const pushDriver =
    params.vapid === undefined ? undefined : createWebPushProvider({ vapidKeys: params.vapid })

  return createNotificationModule({
    config: {
      defaultLocale: NOTIFICATION_DEFAULT_LOCALE,
      defaultTimezone: NOTIFICATION_DEFAULT_TIMEZONE,
      suppressionHmacKey: params.suppressionHmacKey,
    },
    db: params.db as never,
    features: { email: emailDriver !== undefined, push: pushDriver !== undefined },
    providers: {
      channels: {
        ...(emailDriver === undefined ? {} : { email: emailDriver }),
        ...(pushDriver === undefined ? {} : { push: pushDriver }),
      },
      queue: params.queue,
      recipientResolver: createIdentityRecipientResolver({ db: params.db }),
    },
  })
}
