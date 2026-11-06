/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState, type RefObject } from 'react'

import {
  READER_BURST_MIN_LENGTH,
  containsDialog,
  hasOpenDialog,
  isEditableTarget,
  isFocusLost,
  nextReaderBurst,
  type ReaderBurst,
} from './keyReaderFocus.service'

/** O setter nativo + `input` faz qualquer ouvinte (inclusive de um campo controlado) enxergar o valor. */
function setNativeValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  // eslint-disable-next-line @typescript-eslint/unbound-method -- o setter é chamado com `call` no campo
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Mantém o foco no campo do leitor de mão: abre focado, volta a ele quando um diálogo fecha e desvia
 * a rajada de teclas da pistola que cair fora de qualquer campo. Devolve se o campo tem o foco, para
 * o selo — é estado de foco, não de digitação, então não renderiza a cada tecla.
 */
export function useKeyReaderFocus(inputRef: RefObject<HTMLInputElement | null>): boolean {
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    const current = inputRef.current
    if (current === null) return undefined
    const input: HTMLInputElement = current
    let burst: ReaderBurst = { buffer: '', lastAt: 0 }

    function refocusIfLost(): void {
      if (hasOpenDialog(document, input) || !isFocusLost(document)) return
      input.focus()
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target)) {
        burst = { buffer: '', lastAt: 0 }
        return
      }
      burst = nextReaderBurst(burst, {
        at: performance.now(),
        hasModifier: event.ctrlKey || event.metaKey || event.altKey,
        key: event.key,
      })
      if (burst.buffer.length < READER_BURST_MIN_LENGTH || hasOpenDialog(document, input)) return
      event.preventDefault()
      input.focus()
      setNativeValue(input, burst.buffer)
      burst = { buffer: '', lastAt: 0 }
    }

    function handleDialogRemoval(records: readonly MutationRecord[]): void {
      const removedDialog = records.some((record) => [...record.removedNodes].some(containsDialog))
      if (removedDialog) queueMicrotask(refocusIfLost)
    }

    const observer = new MutationObserver(handleDialogRemoval)
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('close', refocusIfLost, true)
    if (isFocusLost(document)) input.focus()

    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('close', refocusIfLost, true)
    }
  }, [inputRef])

  useEffect(() => {
    const input = inputRef.current
    if (input === null) return undefined
    function sync(): void {
      setIsFocused(document.activeElement === input)
    }
    input.addEventListener('focus', sync)
    input.addEventListener('blur', sync)
    sync()

    return () => {
      input.removeEventListener('focus', sync)
      input.removeEventListener('blur', sync)
    }
  }, [inputRef])

  return isFocused
}
