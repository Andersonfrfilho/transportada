/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef } from 'react'

const HISTORY_MARKER_KEY = 'driverBackButtonClose'

function hasHistoryMarker(): boolean {
  const state: unknown = window.history.state
  return typeof state === 'object' && state !== null && HISTORY_MARKER_KEY in state
}

/**
 * O botão voltar do Android dispara `popstate`, nunca um evento de UI: sem isto, com um formulário
 * ou folha aberta, ele saía da tela inteira em vez de fechar só o que estava por cima. Uma entrada
 * de histórico "reserva" o gesto; o fechamento explícito a desfaz para não sobrar uma entrada morta.
 *
 * O desfazer espera uma tarefa porque o `StrictMode` monta, limpa e monta de novo, e o `popstate`
 * do `back()` chegaria depois da remontagem, fechando no mesmo toque que abriu (mesma técnica do
 * `ProofImageLightbox`).
 */
export function useBackButtonClose(onClose: () => void): void {
  const onCloseRef = useRef(onClose)
  const pendingUndoRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (pendingUndoRef.current === undefined) {
      window.history.pushState({ [HISTORY_MARKER_KEY]: true }, '')
    } else {
      clearTimeout(pendingUndoRef.current)
      pendingUndoRef.current = undefined
    }

    function handlePopState(): void {
      onCloseRef.current()
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      pendingUndoRef.current = setTimeout(() => {
        pendingUndoRef.current = undefined
        if (hasHistoryMarker()) window.history.back()
      })
    }
  }, [])
}
