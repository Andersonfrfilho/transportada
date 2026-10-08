/* Copyright (c) 2026 Ada Technology. MIT License. */

export const FIELD_ATTRIBUTE = 'data-field'

/** O campo é um invólucro; quem recebe o foco é o primeiro controle dentro dele. */
const FOCUSABLE_SELECTOR = 'input, button'

type FocusInput = Readonly<{ field: string; panel: HTMLElement | null }>

/**
 * `web.md` §11.3: cada nome do aviso de recusa é um atalho — rola até o campo e põe o foco nele. O campo é achado
 * pelo nome que a API usou, comparado como texto: ele vem do servidor e nunca entra num seletor.
 */
export function focusBusinessCalendarField({ field, panel }: FocusInput): void {
  if (panel === null) return
  const target = [...panel.querySelectorAll<HTMLElement>(`[${FIELD_ATTRIBUTE}]`)].find(
    (element) => element.getAttribute(FIELD_ATTRIBUTE) === field,
  )
  if (target === undefined) return
  const focusable = target.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? target

  // Salto instantâneo: o foco no alvo interrompe a rolagem suave em curso.
  target.scrollIntoView({ behavior: 'auto', block: 'center' })
  focusable.focus({ preventScroll: true })
}
