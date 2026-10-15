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

/**
 * Foco por código não mostra o anel depois de um toque (`:focus-visible` só liga com teclado), e o motorista
 * não via para onde o foco foi. `data-guided-focus` (ver `index.css`) pinta o anel até o foco sair do botão.
 */
function focusWithRing(element: HTMLElement): void {
  element.dataset.guidedFocus = ''
  element.addEventListener('blur', () => delete element.dataset.guidedFocus, { once: true })
  element.focus({ focusVisible: true, preventScroll: true } as FocusOptions)
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
  focusWithRing(button)
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
  if (header !== null) focusWithRing(header)
}

/** Um aviso ou formulário que acabou de abrir: foco nele e à vista, sem arrastar a tela além do necessário. */
export function revealPanel(panel: HTMLElement | null): void {
  if (panel === null) return
  panel.focus({ preventScroll: true })
  panel.scrollIntoView({ behavior: resolveScrollBehavior(), block: 'nearest' })
}

const ANY_FOCUS_TARGET_SELECTOR = '[data-focus-target]'
const PROOF_SECTION_SELECTOR = '[class*="proofSection"]'
/** Pausa entre a foto confirmada e o foco no passo seguinte: o motorista vê a miniatura entrar. */
export const NEXT_STEP_FOCUS_DELAY_MS = 1000

function focusTarget(element: HTMLElement | null): void {
  if (element === null || (element as { disabled?: boolean }).disabled === true) return
  const active = document.activeElement
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  ) {
    return
  }
  focusWithRing(element)
  element.scrollIntoView({ behavior: resolveScrollBehavior(), block: 'nearest' })
}

/** O primeiro comprovante obrigatório que falta na parada (foto, assinatura, nome…): foco e rolagem curta, sem tirar o cursor de quem digita. */
export function focusFirstRequiredProof(card: Element | null): void {
  focusTarget(card?.querySelector<HTMLElement>(ANY_FOCUS_TARGET_SELECTOR) ?? null)
}

/** Depois da foto: o próximo item obrigatório que falta na mesma nota; sem nenhum, o botão de concluir. */
export function focusNextProofStep(actions: HTMLElement | null): void {
  if (actions === null) return
  const scope = actions.closest(PROOF_SECTION_SELECTOR)
  const pending = scope?.querySelector<HTMLElement>(ANY_FOCUS_TARGET_SELECTOR) ?? null
  if (pending !== null) {
    focusTarget(pending)
    return
  }
  focusFinishButton(actions)
}

const ARMED_FOCUS_WINDOW_MS = 15_000
let armedAt: number | undefined
let armedStopAdvanceAt: number | undefined
let armedAutoConcludeAt: number | undefined

/**
 * O "Confirmar entrega" troca a tela do comprovante por outra (um componente novo, já com o canhoto
 * enviado): o novo não sabe que o toque acabou de acontecer. O toque arma, o novo consome uma vez.
 */
/** "Concluir" com mais de um comprovante: a parada que se conclui por esse toque leva o foco ao começo da próxima. */
export function armStopAdvanceFocus(): void {
  armedStopAdvanceAt = Date.now()
}

export function armNextStepFocus(): void {
  armedAt = Date.now()
  armedStopAdvanceAt = Date.now()
  armedAutoConcludeAt = Date.now()
}

export function consumeNextStepFocus(): boolean {
  const isArmed = armedAt !== undefined && Date.now() - armedAt < ARMED_FOCUS_WINDOW_MS
  armedAt = undefined
  return isArmed
}

/** A parada que se conclui por esse mesmo toque leva o foco ao começo da próxima; um aviso próprio, para a outra tela não gastá-lo. */
export function consumeStopAdvanceFocus(): boolean {
  const isArmed =
    armedStopAdvanceAt !== undefined && Date.now() - armedStopAdvanceAt < ARMED_FOCUS_WINDOW_MS
  armedStopAdvanceAt = undefined
  return isArmed
}

/** Canhoto único enviado: o comprovante se conclui sozinho, uma vez, na tela que nasce depois do toque. */
export function consumeAutoConclude(): boolean {
  const isArmed =
    armedAutoConcludeAt !== undefined && Date.now() - armedAutoConcludeAt < ARMED_FOCUS_WINDOW_MS
  armedAutoConcludeAt = undefined
  return isArmed
}

/** Sem "Concluir" para focar (o comprovante já se concluiu): a foto obrigatória da próxima nota da parada. */
export function focusNextPhotoAfter(section: Element | null): void {
  const card = section?.closest(STOP_CARD_SELECTOR) ?? null
  if (section === null || card === null) return
  const next = [...card.querySelectorAll<HTMLElement>(ANY_FOCUS_TARGET_SELECTOR)].find(
    (candidate) =>
      (section.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  )
  focusTarget(next ?? null)
}

/** Liga ou desliga o alvo de foco de um campo, conforme ele ainda seja obrigatório e vazio. */
export function markFocusTarget(
  element: HTMLElement | null | undefined,
  target: string | undefined,
): void {
  if (element === null || element === undefined) return
  if (target === undefined) delete element.dataset.focusTarget
  else element.dataset.focusTarget = target
}
