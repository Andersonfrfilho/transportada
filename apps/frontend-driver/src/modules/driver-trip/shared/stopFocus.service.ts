/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Pedido do usuário (14/10): ao fim de uma ação (foto, Concluir, Devolver) a tela não pode ficar
 * onde o motorista estava — o foco vai ao próximo passo e o cartão da parada volta ao topo. Rolagem
 * suave só quando o aparelho não pediu para reduzir animações.
 */
export function resolveScrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'auto'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/** O botão do fim do formulário (Concluir/Confirmar) à vista e focado, sem arrastar a tela para longe. */
export function focusFinishButton(actions: HTMLElement | null): void {
  const button = actions?.querySelector<HTMLButtonElement>('button') ?? null
  if (button === null || button.disabled) return
  const active = document.activeElement
  // Quem está digitando num campo não perde o cursor por causa de uma foto que acabou de entrar.
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  ) {
    return
  }
  button.focus({ preventScroll: true })
  button.scrollIntoView({ behavior: resolveScrollBehavior(), block: 'nearest' })
}

export const STOP_CARD_SELECTOR = 'li[data-stop-card]'
export const STOP_HEADER_SELECTOR = '[data-stop-header]'

/** O topo do cartão da parada à vista e com o foco no cabeçalho dele — o ponto de partida da próxima ação. */
export function revealStopStart(from: Element | null): void {
  const card = from?.closest(STOP_CARD_SELECTOR) ?? null
  if (card === null) return
  const header = card.querySelector<HTMLElement>(STOP_HEADER_SELECTOR)
  card.scrollIntoView({ behavior: resolveScrollBehavior(), block: 'start' })
  header?.focus({ preventScroll: true })
}
