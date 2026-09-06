import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import {
  createPackageBoxClient,
  type PackageBoxMeasurementInput,
  type PackageBoxStatusFilter,
} from '../shared/packageBoxClient.service'

const PACKAGE_BOX_QUERY_KEY = 'nfe-package-boxes'
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
  return createPackageBoxClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * A fila de medição do conferente (spec 085 G005).
 *
 * ⚠️ A busca e a etiqueta lida são **o mesmo campo** para a consulta: quem bipa e quem digita
 * procuram a mesma caixa, e separar os dois estados faria a tela mostrar resultado de um enquanto o
 * outro ainda estava preenchido.
 */
export function usePackageBoxQueue(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const queryClient = useQueryClient()
  const client = createClient()
  const [search, setSearch] = useState('')
  const [scanned, setScanned] = useState<string | null>(null)
  /** Abre no que falta medir: a fila existe para dizer o que medir agora. */
  const [status, setStatus] = useState<PackageBoxStatusFilter>('pending')
  /**
   * ⚠️ O termo entra na chave **depois** do repouso: cru, "REFRIGERANTE" dispara doze requisições,
   * cada uma com a soma do volume transportado da empresa inteira atrás dela. Mesmo intervalo da
   * busca de endereço do motorista.
   */
  const debouncedSearch = useDebounced(search, SEARCH_DEBOUNCE_MS)
  const queryKey = [
    PACKAGE_BOX_QUERY_KEY,
    input.companyId,
    debouncedSearch,
    scanned,
    status,
  ] as const

  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: () =>
      client.listBoxes({
        status,
        ...(scanned === null ? {} : { scanned }),
        ...(debouncedSearch === '' ? {} : { search: debouncedSearch }),
      }),
    queryKey,
  })

  const measure = useMutation({
    mutationFn: (measurement: PackageBoxMeasurementInput) => client.measureBox(measurement),
    /**
     * Sem `await`: aguardar a releitura aqui segura o botão, e a varredura de fonte de
     * `test/shared/mutation-pending-state.contract.ts` reprova isso.
     */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PACKAGE_BOX_QUERY_KEY] })
    },
  })

  return {
    failed: query.isError,
    isLoading: query.isLoading,
    measure,
    queue: query.data ?? null,
    scanned,
    search,
    setStatus,
    /** Bipar substitui o texto digitado: são a mesma pergunta, feita de dois jeitos. */
    setScanned: (value: null | string) => {
      setScanned(value)
      setSearch('')
    },
    setSearch: (value: string) => {
      setSearch(value)
      setScanned(null)
    },
    status,
  }
}
