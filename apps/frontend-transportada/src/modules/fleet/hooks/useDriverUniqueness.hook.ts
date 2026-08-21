/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

import type { FleetDriverAvailability, FleetDriverAvailabilityInput } from '../shared/fleet.types'
import { getFleetClient } from './useFleet.hook'
import {
  type DriverUniqueField,
  resolveDriverFieldError,
  revealField,
  toDriverFieldErrors,
} from '../shared/driverUniqueness.service'

type UseDriverUniquenessInput = Readonly<{
  check?: (input: FleetDriverAvailabilityInput) => Promise<FleetDriverAvailability>
  /** A ficha aberta não colide consigo mesma; no cadastro novo ainda não há id. */
  driverId?: string
}>

export type DriverUniquenessController = Readonly<{
  /** A referência do input; é por ela que o 409 leva o operador até o campo. */
  bindField: (field: DriverUniqueField) => (element: HTMLInputElement | null) => void
  clear: (field: DriverUniqueField) => void
  confirm: (field: DriverUniqueField, value: string) => void
  errorOf: (field: DriverUniqueField) => string | undefined
  reset: () => void
  /** O 409 do envio: quem decide a colisão é a constraint, não a conferência prévia. */
  showSaveError: (error: unknown) => boolean
}>

type FieldErrors = Partial<Record<DriverUniqueField, string>>

const EMPTY_FIELDS = { driverId: null, email: '', licenseNumber: '', taxId: '' } as const

export function useDriverUniqueness({
  check,
  driverId,
}: UseDriverUniquenessInput): DriverUniquenessController {
  const ask = check ?? ((input) => getFleetClient().checkDriverAvailability(input))
  const [errors, setErrors] = useState<FieldErrors>({})
  const controllers = useRef(new Map<DriverUniqueField, AbortController>())
  const elements = useRef(new Map<DriverUniqueField, HTMLInputElement | null>())
  const binders = useRef(new Map<DriverUniqueField, (element: HTMLInputElement | null) => void>())

  /** O callback é memorizado por campo: um novo a cada render soltaria e religaria a referência. */
  function bindField(field: DriverUniqueField): (element: HTMLInputElement | null) => void {
    const cached = binders.current.get(field)
    if (cached !== undefined) return cached
    const bind = (element: HTMLInputElement | null): void => {
      elements.current.set(field, element)
    }
    binders.current.set(field, bind)
    return bind
  }

  useEffect(() => {
    const pending = controllers.current
    return () => {
      for (const controller of pending.values()) controller.abort()
      pending.clear()
    }
  }, [])

  function abortField(field: DriverUniqueField): AbortController {
    controllers.current.get(field)?.abort()
    const controller = new AbortController()
    controllers.current.set(field, controller)
    return controller
  }

  function clear(field: DriverUniqueField): void {
    abortField(field)
    setErrors((previous) => {
      if (previous[field] === undefined) return previous
      const next = { ...previous }
      delete next[field]
      return next
    })
  }

  /**
   * A conferência prévia é do campo que acabou de sair de foco, e manda só ele: perguntar pelos três
   * a cada `blur` acusaria colisão em campo que o operador ainda não terminou de digitar.
   */
  function confirm(field: DriverUniqueField, value: string): void {
    if (value === '') {
      clear(field)
      return
    }
    const controller = abortField(field)
    void ask({
      ...EMPTY_FIELDS,
      [field]: value,
      ...(driverId === undefined ? {} : { driverId }),
      signal: controller.signal,
    })
      .then((availability) => {
        if (controller.signal.aborted) return
        const taken = toDriverFieldErrors(availability)[field]
        setErrors((previous) => {
          const next = { ...previous }
          if (taken === undefined) delete next[field]
          else next[field] = taken
          return next
        })
      })
      // Conferência é conveniência: rede fora do ar não pode impedir o operador de tentar gravar
      .catch(() => undefined)
  }

  function showSaveError(error: unknown): boolean {
    const resolved = resolveDriverFieldError(error)
    if (resolved === null) return false
    setErrors((previous) => ({ ...previous, [resolved.field]: resolved.feedbackKey }))
    revealField(elements.current.get(resolved.field))
    return true
  }

  function reset(): void {
    for (const controller of controllers.current.values()) controller.abort()
    controllers.current.clear()
    setErrors({})
  }

  return {
    bindField,
    clear,
    confirm,
    errorOf: (field) => errors[field],
    reset,
    showSaveError,
  }
}
