/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolveScrollBehavior } from './useRevealedPanel.hook'

const FIELD_SELECTOR =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), [role="combobox"]:not([disabled])'

type FocusFieldByLabelInput = Readonly<{
  label: string
  panel: HTMLElement | null
}>

/**
 * O aviso nomeia o campo, e quem o encontra na ficha é o rótulo impresso — é ele que o operador
 * leu. Casar pelo caminho do corpo da requisição obrigaria cada um dos campos a carregar o nome
 * interno até a tela, e o rótulo já é único dentro do formulário.
 */
export function focusFieldByLabel({ label, panel }: FocusFieldByLabelInput): void {
  if (panel === null) return

  const owner = [...panel.querySelectorAll('label')].find((element) =>
    (element.textContent ?? '').trim().startsWith(label),
  )
  const field = owner?.querySelector<HTMLElement>(FIELD_SELECTOR)
  if (field === undefined || field === null) return

  field.scrollIntoView({ behavior: resolveScrollBehavior(), block: 'center' })
  field.focus({ preventScroll: true })
}
