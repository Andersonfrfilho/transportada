/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Ref estável: o React o chama uma vez quando o elemento entra na tela, então o foco vai ao aviso que acabou de
 * aparecer e não volta a ser roubado a cada renderização.
 */
export function focusOnMount(element: HTMLElement | null): void {
  element?.focus()
}
