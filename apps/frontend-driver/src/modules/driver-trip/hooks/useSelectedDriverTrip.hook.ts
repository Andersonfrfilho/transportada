/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

import { captureRegistry } from '../shared/captureRegistry.service'
import type { DriverTrip } from '../shared/driverTrip.types'
import { resolveSelectedTrip, resolveTripSwitch } from '../shared/driverTripSelection.service'

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
  /** A troca aconteceu sozinha (ninguém escolheu essa viagem) — a tela avisa o motorista. */
  autoSwitchedTripId: string | undefined
  selectTrip: (tripId: string) => void
  trip: DriverTrip | undefined
}>

/**
 * RF12: a viagem da tela e do Perfil. A escolha fica na sessão, e a tela e o Perfil leem o mesmo
 * valor — o Perfil mostra a placa da viagem escolhida, não a da primeira da lista.
 *
 * A viagem exibida só troca de verdade (`trip.id` diferente) com `captureRegistry.isIdle()` —
 * câmera, assinatura e recorte navegam fora do React (Fullscreen API), e trocar o componente por
 * baixo deles enquanto estão abertos deixa a captura órfã: o "Cancelar" dela chama um `setState`
 * de um componente já desmontado, e não faz mais nada. Com captura aberta, a tela segura a viagem
 * atual até a captura fechar.
 */
export function useSelectedDriverTrip(trips: readonly DriverTrip[]): SelectedDriverTrip {
  const [selectedTripId, setSelectedTripId] = useState(readStoredTripId)
  const resolved = resolveSelectedTrip({ selectedTripId, trips })
  const [trip, setTrip] = useState(resolved)
  const [autoSwitchedTripId, setAutoSwitchedTripId] = useState<string | undefined>(undefined)
  const resolvedRef = useRef(resolved)
  resolvedRef.current = resolved
  const selectedTripIdRef = useRef(selectedTripId)
  selectedTripIdRef.current = selectedTripId

  useEffect(() => {
    const isCaptureIdle = captureRegistry.isIdle()
    const decision = resolveTripSwitch({
      currentTrip: trip,
      isCaptureIdle,
      resolvedTrip: resolved,
      selectedTripId,
    })
    if (decision.trip !== trip) setTrip(decision.trip)
    if (decision.autoSwitchedTripId !== autoSwitchedTripId) {
      setAutoSwitchedTripId(decision.autoSwitchedTripId)
    }

    if (isCaptureIdle || resolved?.id === trip?.id) return undefined

    return captureRegistry.onIdle(() => {
      const next = resolveTripSwitch({
        currentTrip: trip,
        isCaptureIdle: true,
        resolvedTrip: resolvedRef.current,
        selectedTripId: selectedTripIdRef.current,
      })
      setTrip(next.trip)
      setAutoSwitchedTripId(next.autoSwitchedTripId)
    })
  }, [resolved, trip, selectedTripId, autoSwitchedTripId])

  function selectTrip(tripId: string): void {
    setAutoSwitchedTripId(undefined)
    setSelectedTripId(tripId)
    storeTripId(tripId)
  }

  return { autoSwitchedTripId, selectTrip, trip }
}
