/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import type { CargoLayoutPhase } from '../shared/cargoLayoutPolling.service'
import {
  type CargoLayoutTransitionFrame,
  type CargoLayoutTransitionPlan,
  easeCargoTransition,
  flattenPlacedBoxes,
  planCargoLayoutTransition,
  shouldAnimateCargoLayout,
} from '../shared/cargoLayoutTransition.service'
import { CARGO_LAYOUT_TRANSITION_MS } from '../shared/trip.constant'
import type { TripCargoLayout } from '../shared/trip.types'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false
}

/**
 * Spec 145 T13 (D4): guarda a planta que virou fantasma durante a espera e, quando a nova chega
 * pronta, devolve um quadro por vez do deslize de uma para a outra. `null` fora da animação — e
 * sempre sob `prefers-reduced-motion`, em que a troca é direta.
 */
export function useCargoLayoutTransition(
  input: Readonly<{ layout: TripCargoLayout | null; phase: CargoLayoutPhase | undefined }>,
): CargoLayoutTransitionFrame | null {
  const [ghost, setGhost] = useState<TripCargoLayout | null>(null)
  const [plan, setPlan] = useState<CargoLayoutTransitionPlan | null>(null)
  const [progress, setProgress] = useState(0)

  const isWaiting =
    input.phase === 'pending' || input.phase === 'failed' || input.phase === 'timedOut'
  if (isWaiting && input.layout !== null && input.layout !== ghost) setGhost(input.layout)
  if (input.phase === 'ready' && ghost !== null) {
    setGhost(null)
    const next = flattenPlacedBoxes(input.layout)
    const previous = flattenPlacedBoxes(ghost)
    const isAnimated = shouldAnimateCargoLayout({
      boxCount: Math.max(next.length, previous.length),
      prefersReducedMotion: prefersReducedMotion(),
    })
    if (isAnimated) {
      setPlan(planCargoLayoutTransition({ next, previous }))
      setProgress(0)
    }
  }

  useEffect(() => {
    if (plan === null) return undefined
    let frameId = 0
    const startedAt = performance.now()
    const step = (now: number): void => {
      const elapsed = (now - startedAt) / CARGO_LAYOUT_TRANSITION_MS
      if (elapsed >= 1) {
        setPlan(null)
        return
      }
      setProgress(elapsed)
      frameId = requestAnimationFrame(step)
    }
    frameId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frameId)
  }, [plan])

  return plan === null ? null : { plan, progress: easeCargoTransition(progress) }
}
