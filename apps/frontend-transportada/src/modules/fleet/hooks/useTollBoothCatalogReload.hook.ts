/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T303: os extratos registrados (RF3) e a recarga do catálogo a partir de um deles (RF4)
 * — só chamado com `settings.manage` (D6, RF6). A leitura do catálogo (`useTollBoothCatalog.hook`)
 * e o ajuste manual (`useTollBoothCharges.hook`) continuam intactos.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createTollBoothExtractClient } from '../shared/tollBoothExtractClient.service'
import { TOLL_BOOTH_CATALOG_QUERY_KEY } from './useTollBoothCatalog.hook'

export const TOLL_BOOTH_EXTRACTS_QUERY_KEY = 'toll-booth-extracts'

function createClient() {
  return createTollBoothExtractClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * ⚠️ `enabled` tem de ser o mesmo `settings.manage` da aba: sem a permissão, nem a lista de
 * extratos é consultada (RF6, o bloco de recarga não renderiza nem chama a API).
 */
export function useTollBoothCatalogReload(input: Readonly<{ enabled: boolean }>) {
  const client = createClient()
  const queryClient = useQueryClient()

  const extractsQuery = useQuery({
    enabled: input.enabled,
    queryFn: () => client.listTollBoothExtracts(),
    queryKey: [TOLL_BOOTH_EXTRACTS_QUERY_KEY],
  })

  const reloadMutation = useMutation({
    mutationFn: client.reloadTollBoothCatalog,
    onSuccess: () => {
      // A praça gravada e a data recarregada moram nas duas listas — sem invalidar as duas, o
      // cabeçalho do catálogo ficaria com a data antiga até o staleTime vencer sozinho.
      void queryClient.invalidateQueries({ queryKey: [TOLL_BOOTH_CATALOG_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [TOLL_BOOTH_EXTRACTS_QUERY_KEY] })
    },
  })

  return { extractsQuery, reloadMutation }
}
