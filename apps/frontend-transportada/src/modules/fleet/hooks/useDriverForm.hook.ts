/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { FLEET_FEEDBACK_KEY_BY_ERROR } from '../shared/fleet.constant'
import type {
  FleetDriverBody,
  FleetDriverDetail,
  FleetDriverFormState,
  FleetDriverVersionInput,
} from '../shared/fleet.types'
import { createDriverDraft, toDriverBody, toDriverFormState } from '../shared/fleetForm.service'

type UseDriverFormInput = Readonly<{
  driver?: FleetDriverDetail
  onCreate: (body: FleetDriverBody) => Promise<FleetDriverDetail>
  onUpdate: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
}>

export type DriverFormController = Readonly<{
  feedbackKey: null | string
  isSaving: boolean
  patch: (values: Partial<FleetDriverFormState>) => void
  state: FleetDriverFormState
  submit: () => Promise<void>
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
  const { driver, onCreate, onUpdate } = input

  function patch(values: Partial<FleetDriverFormState>): void {
    setFeedbackKey(null)
    setState((previous) => ({ ...previous, ...values }))
  }

  async function submit(): Promise<void> {
    const body = toDriverBody(state)
    setIsSaving(true)
    try {
      await (driver === undefined
        ? onCreate(body)
        : onUpdate({
            ...body,
            driverId: driver.id,
            expectedVersion: driver.version,
            status: driver.status,
          }))
      setFeedbackKey('saved')
    } catch (error) {
      setFeedbackKey(resolveFeedbackKey(error))
    } finally {
      setIsSaving(false)
    }
  }

  return { feedbackKey, isSaving, patch, state, submit }
}
