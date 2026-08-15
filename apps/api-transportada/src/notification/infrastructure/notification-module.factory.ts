/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { QueuePort } from '@adatechnology/notification-contracts'
import { createSmtpEmailProvider } from '@adatechnology/email-provider'
import {
  createNotificationModule,
  type NotificationModule,
} from '@adatechnology/notification-module'

import type { ApiEnvironment } from '../../shared/api.types.js'
import {
  NOTIFICATION_DEFAULT_LOCALE,
  NOTIFICATION_DEFAULT_TIMEZONE,
} from '../notification.constant.js'
import { createIdentityRecipientResolver } from './identity-recipient.resolver.js'
import { createInMemoryNotificationCache } from './in-memory-notification-cache.provider.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type CreateApiNotificationModuleParams = {
  readonly config: Pick<ApiEnvironment, 'cryptography' | 'emailDelivery'>
  readonly db: Database
  /** Ausente, o módulo cai na fila em memória dele — que ninguém consome e que morre no restart. */
  readonly queue?: QueuePort
}

/**
 * Composition root do módulo de notificações desta API. O `recipientResolver` é a única forma de o
 * módulo chegar ao contato de alguém — e ele resolve pelo vínculo com a empresa do contexto, nunca
 * pelo `userId` sozinho.
 *
 * Sem SMTP configurado, o canal de e-mail fica sem driver e sem feature: melhor a notificação
 * existir só na caixa do produto do que ser dada como enviada sem ter saído daqui.
 */
export function createApiNotificationModule({
  config,
  db,
  queue,
}: CreateApiNotificationModuleParams): NotificationModule {
  const emailDriver =
    config.emailDelivery === undefined
      ? undefined
      : createSmtpEmailProvider({
          from: config.emailDelivery.from,
          smtpUrl: config.emailDelivery.smtpUrl,
        })

  return createNotificationModule({
    config: {
      defaultLocale: NOTIFICATION_DEFAULT_LOCALE,
      defaultTimezone: NOTIFICATION_DEFAULT_TIMEZONE,
      suppressionHmacKey: config.cryptography.notificationSuppressionHmacKey,
    },
    db: db as never,
    features: { email: emailDriver !== undefined },
    providers: {
      // Sem `cache` o módulo **pula** a checagem de nonce do webhook em silêncio, e o replay passa.
      cache: createInMemoryNotificationCache(),
      ...(emailDriver === undefined ? {} : { channels: { email: emailDriver } }),
      ...(queue === undefined ? {} : { queue }),
      recipientResolver: createIdentityRecipientResolver({ db }),
    },
  })
}
