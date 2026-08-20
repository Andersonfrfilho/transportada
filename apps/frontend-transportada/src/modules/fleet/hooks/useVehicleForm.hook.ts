/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { FLEET_FEEDBACK_KEY_BY_ERROR } from '../shared/fleet.constant'
import type {
  FleetVehicleBody,
  FleetVehicleDetail,
  FleetVehicleFormState,
  FleetVehicleVersionInput,
} from '../shared/fleet.types'
import { createVehicleDraft, toVehicleBody, toVehicleFormState } from '../shared/fleetForm.service'
import { resolveVehicleBrandDefaults } from '../shared/vehicleBrandDefaults.service'
import { suggestFreightClass } from '../shared/vehicleFreightClass.service'

type UseVehicleFormInput = Readonly<{
  onCreate: (body: FleetVehicleBody) => Promise<FleetVehicleDetail>
  onSaved: () => void
  onUpdate: (input: FleetVehicleBody & FleetVehicleVersionInput) => Promise<FleetVehicleDetail>
  /** A frota carregada é a fonte da ficha técnica que a marca repete — o catálogo FIPE não a tem. */
  vehicles: readonly FleetVehicleDetail[]
  vehicle?: FleetVehicleDetail
}>

export type VehicleFormController = Readonly<{
  feedbackKey: null | string
  isSaving: boolean
  patch: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
  submit: () => Promise<void>
}>

function resolveFeedbackKey(error: unknown, fallbackKey: string): string {
  const code = error instanceof Error ? error.message : ''
  return FLEET_FEEDBACK_KEY_BY_ERROR[code] ?? fallbackKey
}

export function useVehicleForm(input: UseVehicleFormInput): VehicleFormController {
  const [state, setState] = useState<FleetVehicleFormState>(() =>
    input.vehicle === undefined ? createVehicleDraft() : toVehicleFormState(input.vehicle),
  )
  const [feedbackKey, setFeedbackKey] = useState<null | string>(null)
  const [isSaving, setIsSaving] = useState(false)
  const { onCreate, onSaved, onUpdate, vehicle, vehicles } = input

  function patch(values: Partial<FleetVehicleFormState>): void {
    setFeedbackKey(null)
    setState((previous) => {
      const patched = { ...previous, ...values }
      // Trocar o rodado corrige a classe que ele mesmo sugeriu; a escolhida à mão fica
      const next =
        values.wheelType === undefined
          ? patched
          : {
              ...patched,
              freightClass: suggestFreightClass({
                current: previous.freightClass,
                nextWheelType: values.wheelType,
                previousWheelType: previous.wheelType,
              }),
            }
      if (values.brand === undefined && values.model === undefined) return next
      // Os padrões entram por baixo do que já foi digitado: eles só alcançam campo ainda em branco
      return { ...next, ...resolveVehicleBrandDefaults({ state: next, vehicles }) }
    })
  }

  async function submit(): Promise<void> {
    const body = toVehicleBody(state)
    setIsSaving(true)
    try {
      await (vehicle === undefined
        ? onCreate(body)
        : onUpdate({
            ...body,
            expectedVersion: vehicle.version,
            status: vehicle.status,
            vehicleId: vehicle.id,
          }))
      onSaved()
    } catch (error) {
      setFeedbackKey(resolveFeedbackKey(error, 'saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  return { feedbackKey, isSaving, patch, state, submit }
}
