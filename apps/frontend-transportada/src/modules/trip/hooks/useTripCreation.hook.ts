/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

export type TripDraft = Readonly<{ driverIds: readonly string[]; vehicleId: string }>

const EMPTY_TRIP_DRAFT: TripDraft = { driverIds: [], vehicleId: '' }

export type TripCreationController = ReturnType<typeof useTripCreation>

export function useTripCreation() {
  const [draft, setDraft] = useState<TripDraft>(EMPTY_TRIP_DRAFT)

  function setVehicleId(vehicleId: string): void {
    setDraft((current) => ({ ...current, vehicleId }))
  }

  function toggleDriver(driverId: string): void {
    setDraft((current) => ({
      ...current,
      driverIds: current.driverIds.includes(driverId)
        ? current.driverIds.filter((id) => id !== driverId)
        : [...current.driverIds, driverId],
    }))
  }

  function reset(): void {
    setDraft(EMPTY_TRIP_DRAFT)
  }

  return { draft, reset, setVehicleId, toggleDriver }
}
