/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useRef } from 'react'
import type { KeyboardEvent, RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type UseModalDialogInput = Readonly<{
  isOpen: boolean
  onClose: () => void
}>

type UseModalDialogResult = Readonly<{
  dialogRef: RefObject<HTMLDivElement | null>
  handleKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}>

function listFocusable(container: HTMLElement): readonly HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  )
}

export function useModalDialog({ isOpen, onClose }: UseModalDialogInput): UseModalDialogResult {
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const previousOverflow = document.body.style.overflow
    const previouslyFocused = document.activeElement
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [isOpen])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const container = dialogRef.current
      if (container === null) return

      const focusable = listFocusable(container)
      if (focusable.length === 0) {
        event.preventDefault()
        container.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault()
        last?.focus()
        return
      }
      if (!event.shiftKey && (active === last || active === container)) {
        event.preventDefault()
        first?.focus()
      }
    },
    [onClose],
  )

  return { dialogRef, handleKeyDown }
}
