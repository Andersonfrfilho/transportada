/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  createNotificationClient,
  type NotificationClient,
} from '@adatechnology/notification-client'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

let client: NotificationClient | undefined

/**
 * O token é buscado a cada chamada, nunca capturado no boot: ele rotaciona, e um valor preso aqui
 * viraria uma credencial vencida silenciosa depois da primeira renovação de sessão.
 */
export function getNotificationClient(): NotificationClient {
  if (client === undefined) {
    client = createNotificationClient({
      baseUrl: `${getIdentityEnvironment().apiBaseUrl}/v1`,
      async getAuthHeaders() {
        return { authorization: `Bearer ${await getKeycloakAuthProvider().getAccessToken()}` }
      },
    })
  }
  return client
}
