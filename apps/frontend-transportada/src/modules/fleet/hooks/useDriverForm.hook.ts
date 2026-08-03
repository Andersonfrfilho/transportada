/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { FLEET_FEEDBACK_KEY_BY_ERROR } from '../shared/fleet.constant'
import type {
  FleetDriverBody,
  FleetDriverDetail,
  FleetDriverFormState,
  FleetDriverVehicleLink,
  FleetDriverVersionInput,
  FleetReplaceDriverVehiclesInput,
} from '../shared/fleet.types'
import { toSelectedVehicleIds, toggleVehicleSelection } from '../shared/driverVehicles.service'
import { createDriverDraft, toDriverBody, toDriverFormState } from '../shared/fleetForm.service'

type UseDriverFormInput = Readonly<{
  driver?: FleetDriverDetail
  onCreate: (body: FleetDriverBody) => Promise<FleetDriverDetail>
  onUpdate: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
  vehicles?: Readonly<{
    links: readonly FleetDriverVehicleLink[]
    replace: (input: FleetReplaceDriverVehiclesInput) => Promise<unknown>
  }>
}>

export type DriverFormController = Readonly<{
  feedbackKey: null | string
  isSaving: boolean
  patch: (values: Partial<FleetDriverFormState>) => void
  selectedVehicleIds: readonly string[]
  state: FleetDriverFormState
  submit: () => Promise<void>
  toggleVehicle: (vehicleId: string) => void
}>

function resolveFeedbackKey(error: unknown): string {
  const code = error instanceof Error ? error.message : ''
  return FLEET_FEEDBACK_KEY_BY_ERROR[code] ?? 'saveError'
}

export function useDriverForm(input: UseDriverFormInput): DriverFormController {
  const [state, setState] = useState<FleetDriverFormState>(() =>
    input.driver === undefined ? createDriverDraft() : toDriverFormState(input.driver),
  )
  const [feedbackKey, setFeedbackKey] = useState<null | string>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [selection, setSelection] = useState<null | readonly string[]>(null)
  const { driver, onCreate, onUpdate, vehicles } = input
  // `null` significa "o operador ainda não mexeu": a marcação acompanha os vínculos que chegarem.
  const selectedVehicleIds = selection ?? toSelectedVehicleIds(vehicles?.links ?? [])

  function patch(values: Partial<FleetDriverFormState>): void {
    setFeedbackKey(null)
    setState((previous) => ({ ...previous, ...values }))
  }

  function toggleVehicle(vehicleId: string): void {
    setFeedbackKey(null)
    setSelection(toggleVehicleSelection({ selected: selectedVehicleIds, vehicleId }))
  }

  async function submit(): Promise<void> {
    const body = toDriverBody(state)
    setIsSaving(true)
    try {
      const saved = await (driver === undefined
        ? onCreate(body)
        : onUpdate({
            ...body,
            driverId: driver.id,
            expectedVersion: driver.version,
            status: driver.status,
          }))
      if (vehicles !== undefined) {
        await vehicles.replace({ driverId: saved.id, vehicleIds: selectedVehicleIds })
      }
      setFeedbackKey('saved')
    } catch (error) {
      setFeedbackKey(resolveFeedbackKey(error))
    } finally {
      setIsSaving(false)
    }
  }

  return { feedbackKey, isSaving, patch, selectedVehicleIds, state, submit, toggleVehicle }
}
