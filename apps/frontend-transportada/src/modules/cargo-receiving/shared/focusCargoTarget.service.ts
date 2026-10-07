/* Copyright (c) 2026 Ada Technology. MIT License. */

export const FIELD_ATTRIBUTE = 'data-field'
export const DOCUMENT_ATTRIBUTE = 'data-document-id'

/** A linha da nota carrega o atalho; quem recebe o foco é o primeiro controle dela. */
const FOCUSABLE_SELECTOR = 'input, button, textarea, [tabindex]'

type FocusInput = Readonly<{
  attribute: typeof DOCUMENT_ATTRIBUTE | typeof FIELD_ATTRIBUTE
  panel: HTMLElement | null
  value: string
}>

/**
 * `web.md` §11.3: cada nome do aviso é um atalho — rola até o alvo e põe o foco nele. O alvo é achado
 * pelo valor que o servidor usou, comparado como texto: ele vem do servidor e nunca entra num seletor.
 */
export function focusCargoTarget({ attribute, panel, value }: FocusInput): void {
  if (panel === null) return
  const target = [...panel.querySelectorAll<HTMLElement>(`[${attribute}]`)].find(
    (element) => element.getAttribute(attribute) === value,
  )
  if (target === undefined) return

  const focusable = target.matches(FOCUSABLE_SELECTOR)
    ? target
    : (target.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? target)

  // Salto instantâneo: o foco no alvo interrompe a rolagem suave em curso.
  target.scrollIntoView({ behavior: 'auto', block: 'center' })
  focusable.focus({ preventScroll: true })
}
