/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

export const DELIVERY_CLIENT_SEARCH_STORAGE_KEY = 'delivery-clients:name-search'
const DELIVERY_CLIENTS_ROUTE = '/clientes'
const DELIVERY_CLIENTS_WORKSPACE = 'delivery-clients'

/** O destinatário pode ser pessoa física: o nome nunca entra na URL (security.md §8). */
export function buildDeliveryClientSearchRoute(): string {
  return DELIVERY_CLIENTS_ROUTE
}

/** Lê e remove o recado deixado por "Ver cliente"; só a primeira abertura da lista o recebe. */
export function consumeDeliveryClientSearch(): string {
  try {
    const clientName = sessionStorage.getItem(DELIVERY_CLIENT_SEARCH_STORAGE_KEY) ?? ''
    sessionStorage.removeItem(DELIVERY_CLIENT_SEARCH_STORAGE_KEY)
    return clientName
  } catch {
    return ''
  }
}

function rememberDeliveryClientSearch(clientName: string): void {
  try {
    sessionStorage.setItem(DELIVERY_CLIENT_SEARCH_STORAGE_KEY, clientName)
  } catch {
    // Sem storage a lista abre sem filtro: o clique continua levando à tela.
  }
}

export function navigateToDeliveryClientSearch(
  input: Readonly<{ clientName: string; navigator: WorkspaceNavigator }>,
): void {
  rememberDeliveryClientSearch(input.clientName)
  input.navigator.pushPath(buildDeliveryClientSearchRoute())
  input.navigator.rememberWorkspace(DELIVERY_CLIENTS_WORKSPACE)
  input.navigator.dispatchPopState()
}
