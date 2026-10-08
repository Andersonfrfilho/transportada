/* Copyright (c) 2026 Ada Technology. MIT License. */
import { EVENT_KIND_STEP_TIMING } from './clientDiagnostics.constant'
import type { DiagnosticInput } from './clientDiagnostics.types'

export type StepOutcome = 'completed' | 'failed'

export type StepTimerParams = Readonly<{
  clock: () => number
  record: (event: DiagnosticInput) => void
}>

export type StepTimer = Readonly<{
  startStep: (step: string) => Readonly<{ end: (outcome: StepOutcome) => void }>
}>

/** Spec 254 RF2: mede um passo com relógio injetado; a falha vira `send_failed` pelo chamador, não aqui. */
export function createStepTimer(params: StepTimerParams): StepTimer {
  return {
    startStep(step) {
      const startedAt = params.clock()
      return {
        end() {
          const durationMs = Math.max(0, Math.round(params.clock() - startedAt))
          params.record({ durationMs, eventKind: EVENT_KIND_STEP_TIMING, step })
        },
      }
    },
  }
}
