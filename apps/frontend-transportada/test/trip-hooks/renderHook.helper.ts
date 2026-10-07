/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `renderHook` e `waitFor` sobre `react-dom/client` + `act`. São os dois que a suíte usa, e escrevê-los
 * aqui poupa `@testing-library/react` e `@testing-library/dom` com as dependências transitivas deles.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactElement } from 'react'
import { afterEach } from 'bun:test'

import { QUERY_CLIENT_DEFAULT_OPTIONS } from '@/modules/shared/queryClientDefaults.constant'

const WAIT_TIMEOUT_MS = 1_000
const WAIT_STEP_MS = 5

/**
 * Tudo o que um teste montou e ainda não desmontou. ⚠️ O `unmount()` ao fim do teste não roda quando
 * uma asserção falha antes dele: a raiz ficava viva, com o `QueryClient` buscando por baixo, e
 * contaminava os testes seguintes (avisos de `act` e falhas em cascata). O `afterEach` abaixo é a rede.
 */
const mountedUnmounts = new Set<() => void>()

afterEach(() => {
  for (const unmount of [...mountedUnmounts]) unmount()
})

function mountRoot(element: ReactElement): {
  container: HTMLDivElement
  queryClient: QueryClient
  render: () => Promise<void>
  unmount: () => void
} {
  const queryClient = new QueryClient({
    defaultOptions: { ...QUERY_CLIENT_DEFAULT_OPTIONS, mutations: { retry: false } },
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  let isMounted = true

  function unmount(): void {
    if (!isMounted) return
    isMounted = false
    mountedUnmounts.delete(unmount)
    act(() => root.unmount())
    container.remove()
    queryClient.clear()
  }

  mountedUnmounts.add(unmount)
  return {
    container,
    queryClient,
    render: () =>
      act(async () => {
        root.render(createElement(QueryClientProvider, { client: queryClient }, element))
        await Promise.resolve()
      }),
    unmount,
  }
}

export type RenderedHook<TResult> = Readonly<{
  queryClient: QueryClient
  result: () => TResult
  unmount: () => void
}>

export async function renderHook<TResult>(useHook: () => TResult): Promise<RenderedHook<TResult>> {
  const rendered: { current?: TResult } = {}

  function HookProbe(): null {
    rendered.current = useHook()
    return null
  }

  const mounted = mountRoot(createElement(HookProbe))
  await mounted.render()

  return {
    queryClient: mounted.queryClient,
    result: () => {
      if (!('current' in rendered)) throw new Error('HOOK_NOT_RENDERED')
      return rendered.current
    },
    unmount: mounted.unmount,
  }
}

export type RenderedComponent = Readonly<{ queryClient: QueryClient; unmount: () => void }>

/** Monta um componente sob um `QueryClient` novo — para contratos que clicam, não só leem um hook. */
export async function renderWithQueryClient(element: ReactElement): Promise<RenderedComponent> {
  const mounted = mountRoot(element)
  await mounted.render()
  return { queryClient: mounted.queryClient, unmount: mounted.unmount }
}

/** Deixa promessas e efeitos pendentes assentarem dentro de `act`. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
  })
}

/**
 * Espera a condição por **tempo esperado**, não por tempo corrido. ⚠️ Uma asserção que reprova pode
 * custar caro — `expect(noDoDom).toBeNull()` formata o nó inteiro na mensagem, e isso levava de 0,5 s
 * a mais de 1 s —, e contar esse custo contra o prazo fazia a primeira tentativa que reprovava ser a
 * última: o teste caía sem nunca ter esperado nada. Só o tempo gasto em `settle` entra na conta.
 */
export async function waitFor(assertion: () => void): Promise<void> {
  let waitedMs = 0
  for (;;) {
    try {
      assertion()
      return
    } catch (error) {
      if (waitedMs > WAIT_TIMEOUT_MS) throw error
    }
    const startedAt = Date.now()
    await settle()
    waitedMs += Date.now() - startedAt
  }
}
