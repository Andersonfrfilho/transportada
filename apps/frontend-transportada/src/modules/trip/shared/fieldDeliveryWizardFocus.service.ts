/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 156 T16: cada passo do assistente marca com este atributo o controle que recebe o foco ao
 * entrar — "Capturar", "Confirmar", "Enviar", o seletor da nota. Sem isto, o botão clicado some
 * na troca de passo, o foco cai no `<body>`, e o Enter (captura) e o Esc (sair com confirmação)
 * deixam de chegar ao diálogo.
 */
export const FIELD_DELIVERY_FOCUS_ATTRIBUTE = 'data-field-delivery-focus'

const FOCUSABLE_INSIDE_MARKER =
  'button:not([disabled]), input:not([disabled]):not([type="file"]), [tabindex]:not([tabindex="-1"])'

function isFocusable(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && element.matches(FOCUSABLE_INSIDE_MARKER)
}

/**
 * O alvo do foco do passo atual: o próprio elemento marcado, quando é focável, ou o primeiro
 * controle focável dentro dele (o `Select` e o `FileField` não repassam o atributo ao botão).
 * Marcado desabilitado ou ausente devolve `undefined` — quem chama cai no próprio diálogo.
 */
export function resolveFieldDeliveryFocusTarget(
  container: null | ParentNode,
): HTMLElement | undefined {
  const marked = container?.querySelector(`[${FIELD_DELIVERY_FOCUS_ATTRIBUTE}]`)
  if (marked === null || marked === undefined) return undefined
  if (isFocusable(marked)) return marked
  const inner = marked.querySelector(FOCUSABLE_INSIDE_MARKER)
  return inner !== null && isFocusable(inner) ? inner : undefined
}

/** Foca o alvo do passo; sem alvo, o diálogo — o foco nunca fica no `<body>`. */
export function focusFieldDeliveryStep(container: HTMLElement | null): void {
  if (container === null) return
  const target = resolveFieldDeliveryFocusTarget(container)
  if (target !== undefined) {
    target.focus()
    return
  }
  if (!container.contains(document.activeElement)) container.focus()
}
