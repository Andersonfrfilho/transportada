/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  addCityCoverage,
  addRegionCoverage,
  removeDriverCoverage,
  type FleetDriverCoverage,
} from '../shared/driverCoverage.service'
import type { FreightRegion, FreightRegionCity } from '../shared/freightRegion.types'

type UseDriverCoverageInput = Readonly<{
  onChange: () => void
  saved: readonly FleetDriverCoverage[]
}>

export type DriverCoverageController = Readonly<{
  addCity: (input: Readonly<{ city: FreightRegionCity; region: FreightRegion }>) => void
  addRegion: (region: FreightRegion) => void
  clear: () => void
  entries: readonly FleetDriverCoverage[]
  remove: (key: string) => void
}>

export function useDriverCoverage(input: UseDriverCoverageInput): DriverCoverageController {
  const [draft, setDraft] = useState<null | readonly FleetDriverCoverage[]>(null)
  // `null` significa "o operador ainda não mexeu": a marcação acompanha os vínculos que chegarem
  const entries = draft ?? input.saved

  function change(next: readonly FleetDriverCoverage[]): void {
    input.onChange()
    setDraft(next)
  }

  return {
    addCity: ({ city, region }) => change(addCityCoverage({ city, coverage: entries, region })),
    addRegion: (region) => change(addRegionCoverage({ coverage: entries, region })),
    clear: () => change([]),
    entries,
    remove: (key) => change(removeDriverCoverage(entries, key)),
  }
}
