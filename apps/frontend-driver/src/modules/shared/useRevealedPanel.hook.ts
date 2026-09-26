/* Cópia por valor, reduzida, de apps/frontend-transportada/src/modules/shared/useRevealedPanel.hook.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Painel que nasce depois da lista que o abriu cai fora da tela, e quem clicou no botão conclui que
 * nada aconteceu. Rolar até ele e focar o primeiro campo é o que transforma a montagem em resposta.
 *
 * ⚠️ Divergência desta cópia (pedido do usuário, 25/09): o recorte (`ProofCrop`) e a assinatura
 * (`SignaturePad`) não têm `input`/`textarea` — o alvo do foco é o próprio `<canvas>`, que só é
 * alcançável programaticamente com `tabIndex={-1}` (fora da ordem de tabulação, mas focável via
 * `.focus()`). Por isso o seletor aqui ganhou `[tabindex]`, que o original do painel não tem, e o
 * `scrollIntoView` pediu `block: 'center'` em vez de `'start'` — os dois nascem preenchendo a tela
 * inteira em mobile (câmera/assinatura), e centralizar é o que garante o canvas visível nos dois.
 */

const FIRST_FIELD_SELECTOR =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), [role="combobox"]:not([disabled]), [tabindex]:not([disabled])'

function resolveScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/**
 * O mesmo gesto serve à montagem e ao recomeço: a ficha esvaziada depois de gravar é um formulário
 * novo, e deixar o foco no botão obrigaria o operador a rolar de volta para cadastrar o próximo.
 */
export function revealPanel(panel: HTMLElement): void {
  panel.scrollIntoView({ behavior: resolveScrollBehavior(), block: 'center' })
  panel.querySelector<HTMLElement>(FIRST_FIELD_SELECTOR)?.focus({ preventScroll: true })
}

export type RevealedPanel<TElement extends HTMLElement> = Readonly<{
  panelRef: RefObject<TElement | null>
  /** Recomeço explícito: quem esvaziou a ficha chama, e o operador volta ao primeiro campo. */
  reveal: () => void
}>

export function useRevealedPanel<TElement extends HTMLElement>(): RevealedPanel<TElement> {
  const panelRef = useRef<TElement | null>(null)

  useEffect(() => {
    const panel = panelRef.current
    if (panel === null) return

    panel.dataset.revealedPanel = ''
    revealPanel(panel)
  }, [])

  return {
    panelRef,
    reveal: () => {
      const panel = panelRef.current
      if (panel !== null) revealPanel(panel)
    },
  }
}
