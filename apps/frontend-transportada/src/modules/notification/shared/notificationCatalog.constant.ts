/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  NotificationCategoryOption,
  NotificationChannelOption,
} from '@adatechnology/notification-ui'

/**
 * ⚠️ Cópia por valor do catálogo da API (`notification/domain/notification-catalog.constant.ts`).
 * A tela oferece o que o produto entrega: canal a mais promete entrega que não sai, assunto a menos
 * esconde o desligamento de um aviso que existe. `test/notification/settings-catalog.contract.ts`
 * lê o arquivo da API e falha quando os dois divergem.
 */
export const NOTIFICATION_SETTINGS_CHANNEL_IDS = ['inbox', 'email'] as const

/** Rota do workspace de notificações; a navegação manual de `main.tsx` casa por prefixo. */
export const NOTIFICATION_WORKSPACE_HREF = '/notificacoes'

/** Sub-rota do workspace de notificações; a navegação manual de `main.tsx` casa por este valor. */
export const NOTIFICATION_SETTINGS_HREF = `${NOTIFICATION_WORKSPACE_HREF}/preferencias`

export const NOTIFICATION_SETTINGS_CATEGORY_IDS = [
  'cte-batch',
  'nfse',
  'billing',
  'identity',
  'mdfe',
] as const

type TranslateLabel = (key: string) => string

function toLabelKey(id: string): string {
  return id.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

/** Rótulo e dica saem do `*.locale.json`; o id é o vocabulário fechado que a API entende. */
export function buildNotificationSettingsOptions(translate: TranslateLabel): {
  readonly categories: readonly NotificationCategoryOption[]
  readonly channels: readonly NotificationChannelOption[]
} {
  return {
    categories: NOTIFICATION_SETTINGS_CATEGORY_IDS.map((id) => ({
      id,
      label: translate(`settings.${toLabelKey(id)}`),
    })),
    channels: NOTIFICATION_SETTINGS_CHANNEL_IDS.map((id) => ({
      id,
      hint: translate(`settings.${toLabelKey(id)}Hint`),
      label: translate(`settings.${toLabelKey(id)}`),
    })),
  }
}
