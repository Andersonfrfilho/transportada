/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** O que uma linha terminou sendo. `failed` é só o que alerta: `company_disabled` conta à parte. */
export const AUDIO_TRANSCRIPTION_LINE_STATE = {
  COMPANY_DISABLED: 'company_disabled',
  FAILED: 'failed',
  INFRASTRUCTURE: 'infrastructure',
  OWNERSHIP_LOST: 'ownership_lost',
  PURGED: 'purged',
  READY: 'ready',
  RELEASED: 'released',
  RETRIED: 'retried',
} as const
export type AudioTranscriptionLineState =
  (typeof AUDIO_TRANSCRIPTION_LINE_STATE)[keyof typeof AUDIO_TRANSCRIPTION_LINE_STATE]

export type AudioTranscriptionLineResult = {
  readonly state: AudioTranscriptionLineState
  readonly code?: string
}

/** O resumo de uma execução do executor; o ciclo seguinte o grava nos contadores do job-run e o zera. */
export type AudioTranscriptionRunSummary = {
  processed: number
  ready: number
  failed: number
  retried: number
  infrastructure: number
  disabled: number
  purged: number
  runnerError: number
  failedByCode: Record<string, number>
}

export function createRunSummary(): AudioTranscriptionRunSummary {
  return {
    disabled: 0,
    failed: 0,
    failedByCode: {},
    infrastructure: 0,
    processed: 0,
    purged: 0,
    ready: 0,
    retried: 0,
    runnerError: 0,
  }
}

export function addLineToSummary(
  summary: AudioTranscriptionRunSummary,
  result: AudioTranscriptionLineResult,
): void {
  summary.processed += 1
  if (result.state === AUDIO_TRANSCRIPTION_LINE_STATE.READY) summary.ready += 1
  if (result.state === AUDIO_TRANSCRIPTION_LINE_STATE.RETRIED) summary.retried += 1
  if (result.state === AUDIO_TRANSCRIPTION_LINE_STATE.PURGED) summary.purged += 1
  if (result.state === AUDIO_TRANSCRIPTION_LINE_STATE.INFRASTRUCTURE) summary.infrastructure += 1
  if (result.state === AUDIO_TRANSCRIPTION_LINE_STATE.COMPANY_DISABLED) summary.disabled += 1
  if (result.state !== AUDIO_TRANSCRIPTION_LINE_STATE.FAILED) return
  summary.failed += 1
  const code = result.code ?? 'unknown'
  summary.failedByCode[code] = (summary.failedByCode[code] ?? 0) + 1
}

const SNAKE_SEPARATOR = /_([a-z])/gu

function toCamelCase(code: string): string {
  return code.replace(SNAKE_SEPARATOR, (_match, letter: string) => letter.toUpperCase())
}

/** Só números, e só nomes de código: nada que venha do conteúdo do áudio. */
export function summaryToCounters(summary: AudioTranscriptionRunSummary): Record<string, number> {
  const counters: Record<string, number> = {
    processed: summary.processed,
    ready: summary.ready,
    failed: summary.failed,
    retried: summary.retried,
    infrastructure: summary.infrastructure,
    disabled: summary.disabled,
    purged: summary.purged,
    runnerError: summary.runnerError,
  }
  for (const [code, count] of Object.entries(summary.failedByCode)) {
    counters[`failed${toCamelCase(code).replace(/^./u, (first) => first.toUpperCase())}`] = count
  }
  return counters
}

/** Duas execuções que terminam perto uma da outra (trava vencida) somam, em vez de uma apagar a outra. */
export function mergeRunSummaries(
  first: AudioTranscriptionRunSummary,
  second: AudioTranscriptionRunSummary,
): AudioTranscriptionRunSummary {
  const failedByCode = { ...first.failedByCode }
  for (const [code, count] of Object.entries(second.failedByCode)) {
    failedByCode[code] = (failedByCode[code] ?? 0) + count
  }
  return {
    disabled: first.disabled + second.disabled,
    failed: first.failed + second.failed,
    failedByCode,
    infrastructure: first.infrastructure + second.infrastructure,
    processed: first.processed + second.processed,
    purged: first.purged + second.purged,
    ready: first.ready + second.ready,
    retried: first.retried + second.retried,
    runnerError: first.runnerError + second.runnerError,
  }
}
