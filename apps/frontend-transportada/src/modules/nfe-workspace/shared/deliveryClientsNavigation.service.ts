/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  createBrowserWorkspaceNavigator,
  WORKSPACE_STORAGE_KEY,
  type WorkspaceNavigator,
} from '@/modules/shared/workspaceNavigation.service'

/**
 * Spec 150 T305: sem contato ativo, a confirmação aponta para onde cadastrar — a aba "E-mail com
 * contratantes" de `delivery-clients` (spec 143 T017/spec 150 T301).
 *
 * Rodada de correção da Fase 4, item 12: `DeliveryClientWorkspace.page.tsx` agora lê a aba inicial
 * de `?tab=`, o mesmo mecanismo de `NfeWorkspace.page.tsx` — `?tab=mail` no caminho é o que faz o
 * atalho abrir direto na aba certa, em vez de só chegar ao módulo e deixar o operador procurar.
 */
export const DELIVERY_CLIENTS_ROUTE = '/clientes'
export const DELIVERY_CLIENTS_MAIL_ROUTE = '/clientes?tab=mail'
export const DELIVERY_CLIENTS_WORKSPACE = 'delivery-clients'

export { createBrowserWorkspaceNavigator, WORKSPACE_STORAGE_KEY }
export type { WorkspaceNavigator }

export function navigateToDeliveryClients(navigator: WorkspaceNavigator): void {
  navigator.pushPath(DELIVERY_CLIENTS_MAIL_ROUTE)
  navigator.rememberWorkspace(DELIVERY_CLIENTS_WORKSPACE)
  navigator.dispatchPopState()
}
