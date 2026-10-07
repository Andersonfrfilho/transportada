/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O arnês dos contratos de DOM (`renderHook.helper.ts`) tem de ser determinístico sob carga. Duas
 * regras, ambas medidas num defeito real da lista de chegadas: o prazo do `waitFor` conta o tempo
 * ESPERADO, não o que uma asserção reprovada custou; e o que um teste montou sai ao fim dele mesmo
 * quando uma asserção falhou antes do `unmount`.
 */
import { createElement, useEffect } from 'react'
import { describe, expect, test } from 'bun:test'

import { renderWithQueryClient, waitFor } from './renderHook.helper'

/** Mais que o prazo do `waitFor` (1 s): é o custo de formatar um nó do DOM numa mensagem de `expect`. */
const SLOW_FAILURE_MS = 1_200

function burnCpu(durationMs: number): void {
  const until = Date.now() + durationMs
  while (Date.now() < until) {
    // ocupa o laço de eventos como a mensagem de uma asserção reprovada ocupa
  }
}

const lifecycle = { isMounted: false, wasUnmounted: false }

/** O efeito é a prova: só `root.unmount()` roda a limpeza; esvaziar o `body` não roda. */
function LifecycleProbe(): null {
  useEffect(() => {
    lifecycle.isMounted = true
    return () => {
      lifecycle.wasUnmounted = true
    }
  }, [])
  return null
}

describe('o arnês dos contratos de DOM (spec 237 T2.4)', () => {
  test('a primeira reprovação cara não esgota o prazo: o waitFor ainda tenta de novo', async () => {
    let attempts = 0

    await waitFor(() => {
      attempts += 1
      if (attempts > 1) return
      burnCpu(SLOW_FAILURE_MS)
      throw new Error('AINDA_NAO')
    })

    expect(attempts).toBe(2)
  })

  test('condição que nunca vale reprova com a asserção original, e termina', async () => {
    let failure: unknown
    try {
      await waitFor(() => {
        throw new Error('NUNCA_VALE')
      })
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('NUNCA_VALE')
  })

  test('um teste que reprova antes do unmount deixa a raiz montada…', async () => {
    await renderWithQueryClient(createElement(LifecycleProbe))

    expect(lifecycle).toEqual({ isMounted: true, wasUnmounted: false })
  })

  test('…e o afterEach do arnês a desmonta antes do teste seguinte', () => {
    expect(lifecycle.wasUnmounted).toBe(true)
  })
})
