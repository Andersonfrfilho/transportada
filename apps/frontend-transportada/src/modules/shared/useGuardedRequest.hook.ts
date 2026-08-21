/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useRef } from 'react'

export type GuardedRequest = <TResult>(
  perform: (signal: AbortSignal) => Promise<TResult>,
  accept: (result: TResult) => void,
) => void

/**
 * O provedor mais lento é o que responde por último, não o que foi pedido por último: sem o número
 * de sequência o pedido anterior sobrescreve o atual, e quem digitou vê o dado do vizinho.
 */
export function useGuardedRequest(): GuardedRequest {
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      controller.current?.abort()
    },
    [],
  )

  return useCallback((perform, accept) => {
    controller.current?.abort()
    const current = new AbortController()
    controller.current = current
    sequence.current += 1
    const ticket = sequence.current
    void perform(current.signal)
      .then((result) => {
        if (ticket !== sequence.current) return
        accept(result)
      })
      .catch(() => {
        /* Provedor fora do ar ou pedido abortado não é erro de cadastro: o campo segue digitável. */
      })
  }, [])
}
