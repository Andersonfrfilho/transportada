/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Pistola de mão digita mais rápido do que qualquer pessoa: abaixo disto, a tecla é da pistola. */
export const READER_KEY_INTERVAL_MS = 30
/** Quantas teclas seguidas, nesse ritmo, valem como uma leitura em curso e não como digitação. */
export const READER_BURST_MIN_LENGTH = 8

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
const OPEN_DIALOG_SELECTOR = '[aria-modal="true"], dialog[open]'
const DIALOG_SELECTOR = '[role="dialog"], [aria-modal="true"], dialog'

export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null
}

export function hasOpenDialog(root: ParentNode): boolean {
  return root.querySelector(OPEN_DIALOG_SELECTOR) !== null
}

export function containsDialog(node: Node): boolean {
  if (!(node instanceof Element)) return false
  return node.matches(DIALOG_SELECTOR) || node.querySelector(DIALOG_SELECTOR) !== null
}

export function isFocusLost(root: Document): boolean {
  return root.activeElement === null || root.activeElement === root.body
}

export type ReaderBurst = Readonly<{ buffer: string; lastAt: number }>

/** Só tecla imprimível, sem modificador, entra na rajada: o resto (Enter, setas, atalhos) a zera. */
export function nextReaderBurst(
  burst: ReaderBurst,
  input: Readonly<{ at: number; key: string; hasModifier: boolean }>,
): ReaderBurst {
  if (input.key.length !== 1 || input.hasModifier) return { buffer: '', lastAt: input.at }
  const isFast = burst.buffer !== '' && input.at - burst.lastAt < READER_KEY_INTERVAL_MS

  return { buffer: isFast ? burst.buffer + input.key : input.key, lastAt: input.at }
}
