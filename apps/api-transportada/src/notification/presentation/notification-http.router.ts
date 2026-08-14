/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AuthContextResolverPort } from '@adatechnology/module-http'
import { createModuleFetchRouter, type ModuleFetchRouter } from '@adatechnology/module-http/fetch'
import {
  DEFAULT_SSE_HEARTBEAT_SECONDS,
  createNotificationRoutes,
  type NotificationModule,
} from '@adatechnology/notification-module'

import { NOTIFICATION_ROUTES_BASE_PATH } from '../notification.constant.js'

type CreateNotificationHttpRouterParams = {
  readonly authResolver: AuthContextResolverPort
  readonly module: NotificationModule
  /** Ausente: a rota de webhook não é publicada, e o caminho responde 404 em vez de 401. */
  readonly webhookSecret?: string
}

export function createNotificationHttpRouter({
  authResolver,
  module,
  webhookSecret,
}: CreateNotificationHttpRouterParams): ModuleFetchRouter {
  return createModuleFetchRouter({
    authResolver,
    basePath: NOTIFICATION_ROUTES_BASE_PATH,
    routes: createNotificationRoutes({
      heartbeatSeconds: DEFAULT_SSE_HEARTBEAT_SECONDS,
      module,
      ...(webhookSecret === undefined ? {} : { webhookSecret }),
    }),
  })
}
