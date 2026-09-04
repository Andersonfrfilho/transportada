/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useQuery } from '@tanstack/react-query'
import type { NotificationClient } from '@adatechnology/notification-client'

import { getNotificationClient } from '../shared/notificationClient.service'

const EMAIL_TEMPLATES_QUERY_KEY = ['notification', 'email-templates'] as const

/** O contrato do template vem do cliente — o pacote de contratos não é dependência direta. */
export type NotificationTemplateView = Awaited<
  ReturnType<NotificationClient['listTemplates']>
>[number]

/**
 * Os modelos de e-mail que a tela de notificações edita, expostos como consulta reutilizável:
 * quem precisa **ler** o catálogo (o tipo de ocorrência da viagem, por exemplo) importa este hook
 * em vez de duplicar a chamada — a chave fica deste módulo, e ninguém a importa para invalidar.
 */
export function useEmailTemplatesQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<readonly NotificationTemplateView[]>({
    enabled: input.enabled,
    queryFn: () => getNotificationClient().listTemplates(),
    queryKey: EMAIL_TEMPLATES_QUERY_KEY,
  })
}
