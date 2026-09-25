/* Cópia por valor de apps/frontend-transportada/src/modules/notification/shared/notificationClient.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  createNotificationClient,
  type NotificationClient,
} from '@adatechnology/notification-client'

import { getDriverEnvironment } from '@/modules/shared/environment.config'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

let client: NotificationClient | undefined

/**
 * O token é buscado a cada chamada, nunca capturado no boot: ele rotaciona, e um valor preso aqui
 * viraria uma credencial vencida silenciosa depois da primeira renovação de sessão.
 */
export function getNotificationClient(): NotificationClient {
  if (client === undefined) {
    client = createNotificationClient({
      baseUrl: `${getDriverEnvironment().apiBaseUrl}/v1`,
      async getAuthHeaders() {
        return { authorization: `Bearer ${await getKeycloakAuthProvider().getAccessToken()}` }
      },
    })
  }
  return client
}
