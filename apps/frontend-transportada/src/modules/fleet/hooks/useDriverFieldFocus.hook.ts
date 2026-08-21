/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef } from 'react'

import { type DriverFocusField } from '../shared/driverFieldFocus.service'
import { type RevealableField, revealField } from '../shared/driverUniqueness.service'

type InputBinder = (element: HTMLInputElement | null) => void

export type DriverFieldFocusController = Readonly<{
  bindInput: (field: DriverFocusField, delegate?: InputBinder) => InputBinder
  bindTrigger: (field: DriverFocusField) => (element: HTMLButtonElement | null) => void
}>

/**
 * O aviso de outra tela diz qual campo falta; quem leva o olho até ele é este hook. Declare-o
 * **depois** do `useModalDialog`: efeito de hook roda na ordem de declaração, e o foco de abertura
 * do diálogo desfaria o do campo.
 */
export function useDriverFieldFocus(
  input: Readonly<{ field: DriverFocusField | undefined }>,
): DriverFieldFocusController {
  const elements = useRef(new Map<DriverFocusField, null | RevealableField>())
  const binders = useRef(new Map<DriverFocusField, InputBinder>())
  const triggers = useRef(new Map<DriverFocusField, (element: HTMLButtonElement | null) => void>())
  const delegates = useRef(new Map<DriverFocusField, InputBinder>())

  useEffect(() => {
    if (input.field === undefined) return
    revealField(elements.current.get(input.field))
  }, [input.field])

  /** O callback é memorizado por campo: um novo a cada render soltaria e religaria a referência. */
  function bindInput(field: DriverFocusField, delegate?: InputBinder): InputBinder {
    if (delegate !== undefined) delegates.current.set(field, delegate)
    const cached = binders.current.get(field)
    if (cached !== undefined) return cached
    const bind: InputBinder = (element) => {
      elements.current.set(field, element)
      delegates.current.get(field)?.(element)
    }
    binders.current.set(field, bind)
    return bind
  }

  function bindTrigger(field: DriverFocusField): (element: HTMLButtonElement | null) => void {
    const cached = triggers.current.get(field)
    if (cached !== undefined) return cached
    const bind = (element: HTMLButtonElement | null): void => {
      elements.current.set(field, element)
    }
    triggers.current.set(field, bind)
    return bind
  }

  return { bindInput, bindTrigger }
}
