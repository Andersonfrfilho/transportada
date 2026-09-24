/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * `renderHook` e `waitFor` sobre `react-dom/client` + `act`. São os dois que a suíte usa, e escrevê-los
 * aqui poupa `@testing-library/react` e `@testing-library/dom` com as dependências transitivas deles.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { QUERY_CLIENT_DEFAULT_OPTIONS } from '@/modules/shared/queryClientDefaults.constant'

const WAIT_TIMEOUT_MS = 1_000
const WAIT_STEP_MS = 5

export type RenderedHook<TResult> = Readonly<{
  queryClient: QueryClient
  result: () => TResult
  unmount: () => void
}>

export async function renderHook<TResult>(useHook: () => TResult): Promise<RenderedHook<TResult>> {
  const queryClient = new QueryClient({
    defaultOptions: { ...QUERY_CLIENT_DEFAULT_OPTIONS, mutations: { retry: false } },
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const rendered: { current?: TResult } = {}

  function HookProbe(): null {
    rendered.current = useHook()
    return null
  }

  await act(async () => {
    root.render(
      createElement(QueryClientProvider, { client: queryClient }, createElement(HookProbe)),
    )
    await Promise.resolve()
  })

  return {
    queryClient,
    result: () => {
      if (!('current' in rendered)) throw new Error('HOOK_NOT_RENDERED')
      return rendered.current
    },
    unmount: () => {
      act(() => root.unmount())
      container.remove()
      queryClient.clear()
    },
  }
}

/** Deixa promessas e efeitos pendentes assentarem dentro de `act`. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
  })
}

export async function waitFor(assertion: () => void): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  for (;;) {
    try {
      assertion()
      return
    } catch (error) {
      if (Date.now() > deadline) throw error
    }
    await settle()
  }
}
