import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import {
  createPackageBoxClient,
  packageBoxErrorCode,
  type PackageBoxMeasurementInput,
  type PackageBoxStatusFilter,
} from '../shared/packageBoxClient.service'

const PACKAGE_BOX_QUERY_KEY = 'nfe-package-boxes'
const SEARCH_DEBOUNCE_MS = 400
/** Último recurso: a falha não veio da API (rede caiu) e mesmo assim precisa de rótulo na tela. */
const PACKAGE_BOX_MEASURE_FAILED_CODE = 'PACKAGE_BOX_MEASURE_FAILED'

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

  /**
   * ⚠️ **Gravação que falha tem que aparecer.** Sem `onError`, o `PUT` recusado (o `422` da função
   * desligada com a aba aberta, o `400` de corpo inválido) sumia: a tela já tinha voltado para a
   * etiqueta dizendo que estava tudo certo, e a caixa continuava sem medida (T14 item A1).
   */
  const [measureErrorCode, setMeasureErrorCode] = useState<string | undefined>(undefined)

  /**
   * ⚠️ **Reler a MESMA etiqueta depois de uma falha precisa refazer a consulta.** `scanned` está na
   * `queryKey` e o cliente roda com `retry: false`: regravar o mesmo texto não muda a chave, e a
   * consulta ficava parada no erro. O fluxo pedia "leia a etiqueta de novo", o conferente lia, e
   * nada acontecia (3ª revisão, item M1).
   */
  const retryLookup = (): void => {
    void query.refetch()
  }

  const measure = useMutation({
    mutationFn: (measurement: PackageBoxMeasurementInput) => client.measureBox(measurement),
    onError: (error: unknown) => {
      setMeasureErrorCode(packageBoxErrorCode(error) ?? PACKAGE_BOX_MEASURE_FAILED_CODE)
    },
    onMutate: () => setMeasureErrorCode(undefined),
    /**
     * Sem `await`: aguardar a releitura aqui segura o botão, e a varredura de fonte de
     * `test/shared/mutation-pending-state.contract.ts` reprova isso.
     *
     * ⚠️ Limpar aqui também: só em `onMutate` o código sobrevivia até a próxima tentativa, e a
     * Conferência da caixa **seguinte** abria com a recusa da anterior estampada.
     */
    onSuccess: () => {
      setMeasureErrorCode(undefined)
      void queryClient.invalidateQueries({ queryKey: [PACKAGE_BOX_QUERY_KEY] })
    },
  })

  return {
    failed: query.isError,
    isLoading: query.isLoading,
    /**
     * ⚠️ Distinto de `isLoading`: bipar troca a chave da consulta, e é este sinal — não o de
     * carregamento inicial — que diz ao painel quando a resposta da etiqueta lida chegou.
     */
    isMatching: query.isFetching,
    measure,
    /** O código da recusa da última gravação — `undefined` enquanto nada falhou (A1). */
    measureErrorCode,
    queue: query.data ?? null,
    /** Zera o desfecho da gravação anterior — quem abre o fluxo chama antes de começar do zero. */
    resetMeasure: () => {
      measure.reset()
      setMeasureErrorCode(undefined)
    },
    /** Refaz a consulta da etiqueta atual — a saída para a falha que não muda a chave. */
    retryLookup,
    scanned,
    search,
    setStatus,
    /** Bipar substitui o texto digitado: são a mesma pergunta, feita de dois jeitos. */
    setScanned: (value: null | string) => {
      if (value !== null && value === scanned) {
        retryLookup()
        return
      }
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
