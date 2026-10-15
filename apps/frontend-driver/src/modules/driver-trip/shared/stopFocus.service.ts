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

/** Um aviso ou formulário que acabou de abrir: foco nele e à vista, sem arrastar a tela além do necessário. */
export function revealPanel(panel: HTMLElement | null): void {
  if (panel === null) return
  panel.focus({ preventScroll: true })
  panel.scrollIntoView({ behavior: resolveScrollBehavior(), block: 'nearest' })
}

export const PHOTO_FOCUS_TARGET = 'proof-photo'
export const SIGNATURE_FOCUS_TARGET = 'proof-signature'
const ANY_FOCUS_TARGET_SELECTOR = '[data-focus-target]'
const PROOF_SECTION_SELECTOR = '[class*="proofSection"]'
/** Pausa entre a foto confirmada e o foco no passo seguinte: o motorista vê a miniatura entrar. */
export const NEXT_STEP_FOCUS_DELAY_MS = 1000

function focusTarget(button: HTMLButtonElement | null): void {
  if (button === null || button.disabled) return
  const active = document.activeElement
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

/** O "Tirar foto" obrigatório da primeira nota aberta: foco e rolagem curta, sem tirar o cursor de quem digita. */
export function focusFirstRequiredPhoto(card: Element | null): void {
  focusTarget(
    card?.querySelector<HTMLButtonElement>(`[data-focus-target="${PHOTO_FOCUS_TARGET}"]`) ?? null,
  )
}

/** Depois da foto: o próximo item obrigatório que falta na mesma nota; sem nenhum, o botão de concluir. */
export function focusNextProofStep(actions: HTMLElement | null): void {
  if (actions === null) return
  const scope = actions.closest(PROOF_SECTION_SELECTOR)
  const pending = scope?.querySelector<HTMLButtonElement>(ANY_FOCUS_TARGET_SELECTOR) ?? null
  if (pending !== null) {
    focusTarget(pending)
    return
  }
  focusFinishButton(actions)
}

const ARMED_FOCUS_WINDOW_MS = 15_000
let armedAt: number | undefined

/**
 * O "Confirmar entrega" troca a tela do comprovante por outra (um componente novo, já com o canhoto
 * enviado): o novo não sabe que o toque acabou de acontecer. O toque arma, o novo consome uma vez.
 */
export function armNextStepFocus(): void {
  armedAt = Date.now()
}

export function consumeNextStepFocus(): boolean {
  const isArmed = armedAt !== undefined && Date.now() - armedAt < ARMED_FOCUS_WINDOW_MS
  armedAt = undefined
  return isArmed
}
