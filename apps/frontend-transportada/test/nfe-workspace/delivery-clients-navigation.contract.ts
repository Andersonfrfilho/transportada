/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DELIVERY_CLIENTS_MAIL_ROUTE,
  DELIVERY_CLIENTS_WORKSPACE,
  navigateToDeliveryClients,
  WORKSPACE_STORAGE_KEY,
  type WorkspaceNavigator,
} from '../../src/modules/nfe-workspace/shared/deliveryClientsNavigation.service'

/**
 * Rodada de correção da Fase 4, item 12: os atalhos "sem contato ativo" e "configurar e-mail" (T305)
 * levavam só ao módulo `delivery-clients`, sempre na aba "Clientes" — o operador tinha que procurar
 * a aba "E-mail" à mão. `?tab=mail` no caminho é o que faz `DeliveryClientWorkspace.page.tsx` abrir
 * direto nela.
 */
describe('navegação para o módulo de contratantes (spec 150, correção Fase 4)', () => {
  test('empurra o caminho com ?tab=mail, lembra o workspace e dispara o popstate', () => {
    const calls: { pushed?: string; remembered?: string; dispatched: boolean } = {
      dispatched: false,
    }
    const navigator: WorkspaceNavigator = {
      dispatchPopState: () => {
        calls.dispatched = true
      },
      pushPath: (path) => {
        calls.pushed = path
      },
      rememberWorkspace: (workspace) => {
        calls.remembered = workspace
      },
    }

    navigateToDeliveryClients(navigator)

    expect(calls.pushed).toBe(DELIVERY_CLIENTS_MAIL_ROUTE)
    expect(calls.pushed).toContain('?tab=mail')
    expect(calls.remembered).toBe(DELIVERY_CLIENTS_WORKSPACE)
    expect(calls.dispatched).toBe(true)
    expect(WORKSPACE_STORAGE_KEY).toBeTruthy()
  })
})
