/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  isStopOpen,
  toggleStopOverride,
  type StopExpansionOverrides,
} from '../shared/stopExpansion.service'

export type StopExpansionController = Readonly<{
  isOpen: (stopId: string) => boolean
  toggle: (stopId: string) => void
}>

/**
 * Só a sobrescrita mora em estado — o aberto de cada parada é derivado a cada render
 * (`stopExpansion.service.ts`), nunca sincronizado por `useEffect`.
 */
export function useStopExpansion(currentStopId: string | undefined): StopExpansionController {
  const [overrides, setOverrides] = useState<StopExpansionOverrides>(new Map())

  return {
    isOpen: (stopId) => isStopOpen({ currentStopId, overrides, stopId }),
    toggle: (stopId) =>
      setOverrides((current) => toggleStopOverride({ currentStopId, overrides: current, stopId })),
  }
}
