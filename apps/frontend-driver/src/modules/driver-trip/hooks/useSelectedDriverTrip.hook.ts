/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import type { DriverTrip } from '../shared/driverTrip.types'
import { resolveSelectedTrip } from '../shared/driverTripSelection.service'

/** Só o id da viagem, nada do motorista — e some quando a aba fecha. */
const SELECTED_TRIP_STORAGE_KEY = 'transportada.driver-trip.selected-trip'

/** Aba privada ou armazenamento bloqueado: a escolha só não sobrevive à recarga. */
function readStoredTripId(): string | undefined {
  try {
    return window.sessionStorage.getItem(SELECTED_TRIP_STORAGE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function storeTripId(tripId: string): void {
  try {
    window.sessionStorage.setItem(SELECTED_TRIP_STORAGE_KEY, tripId)
  } catch {
    // Sem armazenamento, a escolha vale até a próxima recarga — o estado em memória já a guardou.
  }
}

export type SelectedDriverTrip = Readonly<{
  selectTrip: (tripId: string) => void
  trip: DriverTrip | undefined
}>

/**
 * RF12: a viagem da tela e do Perfil. A escolha fica na sessão, e a tela e o Perfil leem o mesmo
 * valor — o Perfil mostra a placa da viagem escolhida, não a da primeira da lista.
 */
export function useSelectedDriverTrip(trips: readonly DriverTrip[]): SelectedDriverTrip {
  const [selectedTripId, setSelectedTripId] = useState(readStoredTripId)
  const trip = resolveSelectedTrip({ selectedTripId, trips })

  function selectTrip(tripId: string): void {
    setSelectedTripId(tripId)
    storeTripId(tripId)
  }

  return { selectTrip, trip }
}
