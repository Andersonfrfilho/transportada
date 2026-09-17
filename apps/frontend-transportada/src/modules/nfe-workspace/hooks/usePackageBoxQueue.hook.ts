import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import {
  createPackageBoxClient,
  packageBoxErrorCode,
  type PackageBoxMeasurementInput,
  type PackageBoxSiblings,
  type PackageBoxStatusFilter,
} from '../shared/packageBoxClient.service'
import { isRepeatedScan } from '../shared/packageBoxScan.js'

const PACKAGE_BOX_QUERY_KEY = 'nfe-package-boxes'
const SEARCH_DEBOUNCE_MS = 400
/** Último recurso: a falha não veio da API (rede caiu) e mesmo assim precisa de rótulo na tela. */
const PACKAGE_BOX_MEASURE_FAILED_CODE = 'PACKAGE_BOX_MEASURE_FAILED'
const PACKAGE_BOX_REPLICATE_FAILED_CODE = 'PACKAGE_BOX_REPLICATE_FAILED'

/** BAIXO-5 (T14, 5ª revisão): reexportada para não quebrar quem já importa a partir do hook. */
export { isRepeatedScan } from '../shared/packageBoxScan.js'

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
    /**
     * ⚠️ Reforço complementar ao ALTO-1 (T14, 5ª revisão) — não substitui a correção estrutural do
     * painel (`denied`/`loading`/`failed` como ramos do mesmo `return`), mas reduz o motivo pelo
     * qual `loading` fica `true` no meio de um bipe: `scanned` muda a `queryKey`, e sem dado prévio
     * para a chave nova o React Query marcava `isLoading` mesmo com a fila já carregada. Mantendo o
     * dado anterior durante o refetch, `isLoading` só vale para o carregamento inicial de verdade.
     */
    placeholderData: keepPreviousData,
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

  /** ⚠️ Mesmo padrão de `measureErrorCode` (A1): recusa de replicar precisa aparecer no diálogo. */
  const [replicateErrorCode, setReplicateErrorCode] = useState<string | undefined>(undefined)

  /**
   * Spec 155 (G004, D5): replicar é sempre confirmado pelo conferente — a mutação só existe, quem
   * decide chamar é o diálogo. Invalida a mesma chave da medida: a família inteira precisa reler os
   * contadores e o `measuredAt` dos alvos gravados.
   */
  const replicate = useMutation({
    mutationFn: (input: Readonly<{ boxId: string; targetIds: readonly string[] }>) =>
      client.replicate(input),
    onError: (error: unknown) => {
      setReplicateErrorCode(packageBoxErrorCode(error) ?? PACKAGE_BOX_REPLICATE_FAILED_CODE)
    },
    onMutate: () => setReplicateErrorCode(undefined),
    onSuccess: () => {
      setReplicateErrorCode(undefined)
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
    replicate,
    /** O código da recusa da última réplica — `undefined` enquanto nada falhou. */
    replicateErrorCode,
    /** Zera o desfecho da gravação anterior — quem abre o fluxo chama antes de começar do zero. */
    resetMeasure: () => {
      measure.reset()
      setMeasureErrorCode(undefined)
    },
    /**
     * T14 (revisão final, ALTO-2): o painel chama isto ao abrir e ao fechar o diálogo de replicar —
     * sem isso, a recusa (ou o `isPending`) da réplica anterior sobrevivia para o próximo diálogo.
     */
    resetReplicate: () => {
      replicate.reset()
      setReplicateErrorCode(undefined)
    },
    /** Refaz a consulta da etiqueta atual — a saída para a falha que não muda a chave. */
    retryLookup,
    scanned,
    search,
    setStatus,
    /** Bipar substitui o texto digitado: são a mesma pergunta, feita de dois jeitos. */
    setScanned: (value: null | string) => {
      /** BAIXO-1 (T14, 5ª revisão): `setSearch('')` era inalcançável neste ramo — removido, não
       *  reescrito, porque `code-standards.md` proíbe tratar estado impossível. */
      if (isRepeatedScan({ current: scanned, next: value })) {
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

/**
 * Spec 155 (D9, G003): as irmãs de família/embalagem de UMA caixa, sob demanda — nunca junto da
 * fila de 50 linhas. `boxId: null` desliga a consulta (o botão rápido e o diálogo de replicar
 * pedem exatamente a caixa que estão mostrando, nunca a fila inteira).
 */
export function usePackageBoxSiblings(input: Readonly<{ boxId: null | string }>) {
  const client = createClient()
  const query = useQuery<PackageBoxSiblings>({
    enabled: input.boxId !== null,
    queryFn: () => client.listSiblings({ boxId: input.boxId as string }),
    queryKey: [PACKAGE_BOX_QUERY_KEY, 'siblings', input.boxId],
  })

  return {
    failed: query.isError,
    loading: query.isLoading,
    siblings: query.data ?? null,
  }
}
