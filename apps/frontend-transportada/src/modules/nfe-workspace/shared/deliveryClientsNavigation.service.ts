/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  createBrowserWorkspaceNavigator,
  WORKSPACE_STORAGE_KEY,
  type WorkspaceNavigator,
} from '@/modules/shared/workspaceNavigation.service'

/**
 * Spec 150 T305: sem contato ativo, a confirmação aponta para onde cadastrar — a aba "E-mail com
 * contratantes" de `delivery-clients` (spec 143 T017/spec 150 T301). Não existe registro
 * programático de aba nesta app (`DeliveryClientWorkspace.page.tsx` sempre abre em "Clientes"), só
 * de workspace inteiro — a navegação chega ao módulo certo, e o texto ao lado diz o nome da aba.
 */
export const DELIVERY_CLIENTS_ROUTE = '/clientes'
export const DELIVERY_CLIENTS_WORKSPACE = 'delivery-clients'

export { createBrowserWorkspaceNavigator, WORKSPACE_STORAGE_KEY }
export type { WorkspaceNavigator }

export function navigateToDeliveryClients(navigator: WorkspaceNavigator): void {
  navigator.pushPath(DELIVERY_CLIENTS_ROUTE)
  navigator.rememberWorkspace(DELIVERY_CLIENTS_WORKSPACE)
  navigator.dispatchPopState()
}
