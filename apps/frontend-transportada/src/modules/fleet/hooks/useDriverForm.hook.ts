/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { FLEET_FEEDBACK_KEY_BY_ERROR } from '../shared/fleet.constant'
import {
  addCityCoverage,
  addRegionCoverage,
  removeDriverCoverage,
  toDriverCoverageEntries,
  type FleetDriverCoverage,
} from '../shared/driverCoverage.service'
import type {
  FleetDriverBody,
  FleetDriverDetail,
  FleetDriverFormState,
  FleetDriverVehicleLink,
  FleetDriverVersionInput,
  FleetReplaceDriverRegionsInput,
  FleetReplaceDriverVehiclesInput,
} from '../shared/fleet.types'
import type { FreightRegion, FreightRegionCity } from '../shared/freightRegion.types'
import { toSelectedVehicleIds, toggleVehicleSelection } from '../shared/driverVehicles.service'
import { createDriverDraft, toDriverBody, toDriverFormState } from '../shared/fleetForm.service'

type UseDriverFormInput = Readonly<{
  driver?: FleetDriverDetail
  onCreate: (body: FleetDriverBody) => Promise<FleetDriverDetail>
  onUpdate: (input: FleetDriverBody & FleetDriverVersionInput) => Promise<FleetDriverDetail>
  regions?: Readonly<{
    coverage: readonly FleetDriverCoverage[]
    replace: (input: FleetReplaceDriverRegionsInput) => Promise<unknown>
  }>
  vehicles?: Readonly<{
    links: readonly FleetDriverVehicleLink[]
    replace: (input: FleetReplaceDriverVehiclesInput) => Promise<unknown>
  }>
}>

export type DriverCoverageController = Readonly<{
  addCity: (input: Readonly<{ city: FreightRegionCity; region: FreightRegion }>) => void
  addRegion: (region: FreightRegion) => void
  clear: () => void
  entries: readonly FleetDriverCoverage[]
  remove: (key: string) => void
}>

export type DriverFormController = Readonly<{
  coverage: DriverCoverageController
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
  const [coverageDraft, setCoverageDraft] = useState<null | readonly FleetDriverCoverage[]>(null)
  const { driver, onCreate, onUpdate, regions, vehicles } = input
  // `null` significa "o operador ainda não mexeu": a marcação acompanha os vínculos que chegarem.
  const selectedVehicleIds = selection ?? toSelectedVehicleIds(vehicles?.links ?? [])
  const coverageEntries = coverageDraft ?? regions?.coverage ?? []

  function changeCoverage(next: readonly FleetDriverCoverage[]): void {
    setFeedbackKey(null)
    setCoverageDraft(next)
  }

  const coverage: DriverCoverageController = {
    addCity: ({ city, region }) =>
      changeCoverage(addCityCoverage({ city, coverage: coverageEntries, region })),
    addRegion: (region) => changeCoverage(addRegionCoverage({ coverage: coverageEntries, region })),
    clear: () => changeCoverage([]),
    entries: coverageEntries,
    remove: (key) => changeCoverage(removeDriverCoverage(coverageEntries, key)),
  }

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
      if (regions !== undefined) {
        await regions.replace({
          driverId: saved.id,
          entries: toDriverCoverageEntries(coverageEntries),
        })
      }
      setFeedbackKey('saved')
    } catch (error) {
      setFeedbackKey(resolveFeedbackKey(error))
    } finally {
      setIsSaving(false)
    }
  }

  return {
    coverage,
    feedbackKey,
    isSaving,
    patch,
    selectedVehicleIds,
    state,
    submit,
    toggleVehicle,
  }
}
