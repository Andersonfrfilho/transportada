/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Painel que nasce depois da lista que o abriu cai fora da tela, e quem clicou no botão conclui que
 * nada aconteceu. Rolar até ele e focar o primeiro campo é o que transforma a montagem em resposta.
 */

const FIRST_FIELD_SELECTOR =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), [role="combobox"]:not([disabled])'

function resolveScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export function useRevealedPanel<TElement extends HTMLElement>(): RefObject<TElement | null> {
  const panelRef = useRef<TElement | null>(null)

  useEffect(() => {
    const panel = panelRef.current
    if (panel === null) return

    // O atributo é o gancho do `scroll-margin` global — sem ele o painel encosta na borda de cima.
    panel.dataset.revealedPanel = ''
    panel.scrollIntoView({ behavior: resolveScrollBehavior(), block: 'start' })

    // O scroll síncrono do foco cancelaria a rolagem suave iniciada acima.
    panel.querySelector<HTMLElement>(FIRST_FIELD_SELECTOR)?.focus({ preventScroll: true })
  }, [])

  return panelRef
}
