/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { FLEET_FEEDBACK_KEY_BY_ERROR } from '../shared/fleet.constant'
import type {
  FleetVehicleBody,
  FleetVehicleDetail,
  FleetVehicleFormState,
  FleetVehicleVersionInput,
} from '../shared/fleet.types'
import {
  applyVehicleLookup,
  createVehicleDraft,
  toVehicleBody,
  toVehicleFormState,
} from '../shared/fleetForm.service'
import type { VehicleLookupController } from './useVehicleLookup.hook'

type UseVehicleFormInput = Readonly<{
  lookup: VehicleLookupController
  onCreate: (body: FleetVehicleBody) => Promise<FleetVehicleDetail>
  onUpdate: (input: FleetVehicleBody & FleetVehicleVersionInput) => Promise<FleetVehicleDetail>
  vehicle?: FleetVehicleDetail
}>

export type VehicleFormController = Readonly<{
  feedbackKey: null | string
  isLookingUpPlate: boolean
  isSaving: boolean
  lookupPlate: () => Promise<void>
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
  const [isLookingUpPlate, setIsLookingUpPlate] = useState(false)
  const { lookup, onCreate, onUpdate, vehicle } = input

  function patch(values: Partial<FleetVehicleFormState>): void {
    setFeedbackKey(null)
    setState((previous) => ({ ...previous, ...values }))
  }

  async function lookupPlate(): Promise<void> {
    setFeedbackKey(null)
    setIsLookingUpPlate(true)
    try {
      const found = await lookup.lookup(state.plate)
      if (found === null) {
        setFeedbackKey('lookupNotFound')
        return
      }
      setState((previous) => applyVehicleLookup(previous, found))
    } catch (error) {
      setFeedbackKey(resolveFeedbackKey(error, 'lookupFailed'))
    } finally {
      setIsLookingUpPlate(false)
    }
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
      setFeedbackKey('saved')
    } catch (error) {
      setFeedbackKey(resolveFeedbackKey(error, 'saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  return { feedbackKey, isLookingUpPlate, isSaving, lookupPlate, patch, state, submit }
}
