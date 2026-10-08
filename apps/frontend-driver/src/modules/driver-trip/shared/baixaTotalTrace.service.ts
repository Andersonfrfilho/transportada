/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  EVENT_KIND_SEND_FAILED,
  EVENT_KIND_STEP_TIMING,
  STEP_BAIXA_TOTAL,
} from './clientDiagnostics.constant'
import type { DiagnosticInput } from './clientDiagnostics.types'

export type TraceBaixaTotalParams<TResult> = Readonly<{
  clock: () => number
  record: (event: DiagnosticInput) => void
  reportKind: string
  run: () => Promise<TResult>
}>

/** Spec 254 RF2: do toque até a fila aceitar o item; só observa, devolve ou relança o que `run` fez. */
export async function traceBaixaTotal<TResult>(
  params: TraceBaixaTotalParams<TResult>,
): Promise<TResult> {
  const startedAt = params.clock()
  const describe = (eventKind: DiagnosticInput['eventKind']): DiagnosticInput => ({
    durationMs: Math.max(0, Math.round(params.clock() - startedAt)),
    eventKind,
    reportKind: params.reportKind,
    step: STEP_BAIXA_TOTAL,
  })
  try {
    const result = await params.run()
    params.record(describe(EVENT_KIND_STEP_TIMING))
    return result
  } catch (error) {
    params.record({ ...describe(EVENT_KIND_SEND_FAILED), failureKind: 'local' })
    throw error
  }
}
