/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { FreightVehicleClass } from '@/modules/shared/freightClass.constant'

import { resolveFleetFeedbackKey } from '../shared/fleetFeedback.service'
import type {
  FreightRegion,
  FreightRegionBodyInput,
  FreightRegionUpdateInput,
} from '../shared/freightRegion.types'
import {
  buildFreightRegionBody,
  emptyFreightRegionForm,
  toFreightRegionForm,
} from '../shared/freightRegionForm.service'
import type {
  FreightRegionFormError,
  FreightRegionFormState,
} from '../shared/freightRegionForm.service'

type UseFreightRegionFormInput = Readonly<{
  onCreate: (body: FreightRegionBodyInput) => Promise<unknown>
  onSaved: () => void
  onUpdate: (input: FreightRegionUpdateInput) => Promise<unknown>
  region?: FreightRegion
}>

export type FreightRegionFormController = Readonly<{
  errors: readonly FreightRegionFormError[]
  feedbackKey: null | string
  isSaving: boolean
  patch: (values: Partial<FreightRegionFormState>) => void
  patchRate: (input: Readonly<{ freightClass: FreightVehicleClass; value: string }>) => void
  state: FreightRegionFormState
  submit: () => Promise<void>
}>

export function useFreightRegionForm(
  input: UseFreightRegionFormInput,
): FreightRegionFormController {
  const [state, setState] = useState<FreightRegionFormState>(() =>
    input.region === undefined ? emptyFreightRegionForm() : toFreightRegionForm(input.region),
  )
  const [errors, setErrors] = useState<readonly FreightRegionFormError[]>([])
  const [feedbackKey, setFeedbackKey] = useState<null | string>(null)
  const [isSaving, setIsSaving] = useState(false)
  const { onCreate, onSaved, onUpdate, region } = input

  function patch(values: Partial<FreightRegionFormState>): void {
    setErrors([])
    setFeedbackKey(null)
    setState((previous) => ({ ...previous, ...values }))
  }

  function patchRate(values: Readonly<{ freightClass: FreightVehicleClass; value: string }>): void {
    setErrors([])
    setFeedbackKey(null)
    setState((previous) => ({
      ...previous,
      rates: { ...previous.rates, [values.freightClass]: values.value },
    }))
  }

  async function submit(): Promise<void> {
    const result = buildFreightRegionBody(state)
    // Campo inválido não vira requisição: a API responderia 400 sem apontar qual campo é
    if (!result.ok) {
      setErrors(result.errors)
      return
    }

    setErrors([])
    setIsSaving(true)
    try {
      await (region === undefined
        ? onCreate(result.body)
        : onUpdate({
            ...result.body,
            expectedVersion: region.version,
            regionId: region.id,
            status: region.status,
          }))
      onSaved()
    } catch (error) {
      setFeedbackKey(resolveFleetFeedbackKey(error))
    } finally {
      setIsSaving(false)
    }
  }

  return { errors, feedbackKey, isSaving, patch, patchRate, state, submit }
}
