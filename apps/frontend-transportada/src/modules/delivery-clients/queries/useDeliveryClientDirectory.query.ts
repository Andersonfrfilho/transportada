/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getDeliveryClientsClient } from '../shared/deliveryClientsClient.service'
import type { DeliveryClient } from '../shared/deliveryClients.types'

export const DELIVERY_CLIENT_DIRECTORY_QUERY_KEY = ['delivery-clients', 'directory'] as const

const PAGE_SIZE = 100
/** Rede de segurança contra cursor que não termina: 30 páginas de 100 são três mil destinatários. */
const MAX_PAGES = 30
/** Chegar a este total é o sinal de que a lista pode ter sido cortada: a tela avisa. */
export const DELIVERY_CLIENT_DIRECTORY_LIMIT = PAGE_SIZE * MAX_PAGES

async function loadAllActiveClients(): Promise<readonly DeliveryClient[]> {
  const client = getDeliveryClientsClient()
  const clients: DeliveryClient[] = []
  let cursor: null | string = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // O cursor da próxima página só existe depois da resposta desta: não há o que paralelizar.
    const result = await client.listClients({
      cursor,
      filters: { nameContains: '', requiresScheduling: null, status: 'active' },
      limit: PAGE_SIZE,
    })
    clients.push(...result.items)
    if (result.nextCursor === null) break
    cursor = result.nextCursor
  }
  return clients
}

/**
 * Spec 246 RF1f: o destinatário da exceção é escolhido entre os clientes cadastrados, nunca digitado —
 * a lista inteira é carregada uma vez para o seletor buscar por nome ou CNPJ no cliente.
 */
export function useDeliveryClientDirectoryQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery({
    enabled: input.enabled,
    queryFn: loadAllActiveClients,
    queryKey: DELIVERY_CLIENT_DIRECTORY_QUERY_KEY,
  })
}
