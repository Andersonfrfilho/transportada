/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O catálogo inteiro de praças (spec 154 RF1), com busca e paginação do servidor (D2) — a fonte da
 * aba de pedágio em Frota. `useTollBoothCharges.hook.ts` continua sendo quem grava o ajuste; este
 * hook só lê.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { TOLL_BOOTH_CATALOG_PAGE_SIZE } from '../shared/fleet.constant'
import { createTollBoothCatalogClient } from '../shared/tollBoothCatalogClient.service'

export const TOLL_BOOTH_CATALOG_QUERY_KEY = 'toll-booth-catalog'
const SEARCH_DEBOUNCE_MS = 400

function useDebounced(value: string, delayMs: number): string {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs, value])
  return settled
}

function createClient() {
  return createTollBoothCatalogClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useTollBoothCatalog(
  input: Readonly<{ companyId?: string; enabled: boolean; initialSearch?: string }>,
) {
  const client = createClient()
  /**
   * RF7 (spec 154): a ação de ajuste do extrato da rota chega aqui com o nome da praça já pronto
   * (`FLEET_TOLL_BOOTH_PARAMETER`) — sem isso, quem clica "ajustar" cairia numa busca vazia e teria
   * de digitar de novo o que a rota já sabia.
   */
  const [search, setSearch] = useState(input.initialSearch ?? '')
  const [page, setPage] = useState(1)
  /**
   * ⚠️ O termo entra na chave **depois** do repouso — mesmo intervalo da busca de caixa
   * (`usePackageBoxQueue.hook.ts`): sem isso, cada tecla dispara uma consulta ao catálogo inteiro.
   */
  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS)
  const queryKey = [TOLL_BOOTH_CATALOG_QUERY_KEY, input.companyId, debouncedSearch, page] as const

  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    /** Trocar de página ou buscar não pode piscar a lista inteira para o esqueleto de novo. */
    placeholderData: keepPreviousData,
    queryFn: () =>
      client.listTollBoothCatalog({
        page,
        perPage: TOLL_BOOTH_CATALOG_PAGE_SIZE,
        ...(debouncedSearch === '' ? {} : { search: debouncedSearch }),
      }),
    queryKey,
  })

  /** Toda busca nova volta para a primeira página — a página 3 de uma busca antiga não existe na nova. */
  function setSearchTerm(value: string): void {
    setSearch(value)
    setPage(1)
  }

  return { page, query, search, setPage, setSearch: setSearchTerm }
}
