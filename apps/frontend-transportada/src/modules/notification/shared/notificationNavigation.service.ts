/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  createBrowserWorkspaceNavigator,
  type WorkspaceNavigator,
} from '@/modules/shared/workspaceNavigation.service'

import {
  resolveNotificationTarget,
  type NotificationTargetSource,
} from './notificationTarget.service'

/**
 * Abre a tela do aviso. A página de notificações e o painel do sino usam o mesmo caminho: o painel
 * que só marcava como lida deixava o clique sem destino. Devolve `false` quando o aviso não aponta
 * para nada, e quem chamou decide o que fazer (o painel continua aberto).
 */
export function openNotificationTarget(
  notification: NotificationTargetSource,
  navigator: WorkspaceNavigator = createBrowserWorkspaceNavigator(),
): boolean {
  const target = resolveNotificationTarget(notification)
  if (target === null) return false
  navigator.pushPath(target.href)
  navigator.rememberWorkspace(target.workspace)
  navigator.dispatchPopState()
  return true
}
