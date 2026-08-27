/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { getDeliveryClientsClient } from '../shared/deliveryClientsClient.service'
import type {
  DeliveryClientDetail,
  DeliveryClientFilters,
  DeliveryClientWrite,
  DeliveryException,
  DeliveryWindow,
} from '../shared/deliveryClients.types'

const DELIVERY_CLIENTS_QUERY_KEY = 'delivery-clients'
const PAGE_SIZE = 25
const FLEET_MANAGE_PERMISSION = 'fleet.manage'

export const EMPTY_DELIVERY_CLIENT_FILTERS: DeliveryClientFilters = {
  nameContains: '',
  requiresScheduling: null,
  status: 'active',
}

export type DeliveryClientsController = Readonly<{
  canManageClients: boolean
  clients: readonly DeliveryClientDetail[] | undefined
  cursor: string | null
  filters: DeliveryClientFilters
  isLoading: boolean
  nextCursor: string | null
  replaceExceptions: (
    input: Readonly<{ exceptions: readonly DeliveryException[]; id: string }>,
  ) => Promise<void>
  replaceWindows: (
    input: Readonly<{ id: string; windows: readonly DeliveryWindow[] }>,
  ) => Promise<void>
  selectClient: (id: string | null) => void
  selectedClient: DeliveryClientDetail | undefined
  selectedClientId: string | null
  setCursor: (cursor: string | null) => void
  setFilters: (filters: DeliveryClientFilters) => void
  updateClient: (input: Readonly<{ id: string; values: DeliveryClientWrite }>) => Promise<void>
}>

/**
 * Spec 060: a tela **preenche regra**, não cria cliente — o cadastro nasceu da nota. A ficha é
 * carregada por id porque janela e exceção não vêm na listagem: trazê-las para vinte linhas seria
 * puxar a semana inteira de gente que ninguém abriu.
 */
export function useDeliveryClients(
  input: Readonly<{ permissions: readonly string[] }>,
): DeliveryClientsController {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<DeliveryClientFilters>(EMPTY_DELIVERY_CLIENT_FILTERS)
  const [cursor, setCursor] = useState<string | null>(null)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)

  const page = useQuery({
    queryFn: () =>
      getDeliveryClientsClient().listClients({ cursor, filters, limit: PAGE_SIZE }),
    queryKey: [DELIVERY_CLIENTS_QUERY_KEY, 'list', cursor, filters],
  })

  const detail = useQuery({
    enabled: selectedClientId !== null,
    queryFn: () => getDeliveryClientsClient().getClient(selectedClientId ?? ''),
    queryKey: [DELIVERY_CLIENTS_QUERY_KEY, 'detail', selectedClientId],
  })

  /** A revalidação não segura o botão: `isPending` cai quando o trabalho acaba, não quando o cache esfria. */
  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: [DELIVERY_CLIENTS_QUERY_KEY] })
  }

  const update = useMutation({
    mutationFn: (request: Readonly<{ id: string; values: DeliveryClientWrite }>) =>
      getDeliveryClientsClient().updateClient(request),
    onSuccess: invalidate,
  })
  const windows = useMutation({
    mutationFn: (request: Readonly<{ id: string; windows: readonly DeliveryWindow[] }>) =>
      getDeliveryClientsClient().replaceWindows(request),
    onSuccess: invalidate,
  })
  const exceptions = useMutation({
    mutationFn: (request: Readonly<{ exceptions: readonly DeliveryException[]; id: string }>) =>
      getDeliveryClientsClient().replaceExceptions(request),
    onSuccess: invalidate,
  })

  return {
    canManageClients: input.permissions.includes(FLEET_MANAGE_PERMISSION),
    clients: page.data?.items as readonly DeliveryClientDetail[] | undefined,
    cursor,
    filters,
    isLoading: page.isLoading,
    nextCursor: page.data?.nextCursor ?? null,
    async replaceExceptions(request) {
      await exceptions.mutateAsync(request)
    },
    async replaceWindows(request) {
      await windows.mutateAsync(request)
    },
    selectClient: setSelectedClientId,
    selectedClient: detail.data,
    selectedClientId,
    setCursor,
    setFilters: (next) => {
      /** Filtro novo recomeça a paginação: manter o cursor mostraria a página dois de outra lista. */
      setCursor(null)
      setFilters(next)
    },
    async updateClient(request) {
      await update.mutateAsync(request)
    },
  }
}
