/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Tempo limite dos testes de razão: sob load 39 as arrumações chegaram a 1 s cada. */
export const RELATIVE_TIMING_TIMEOUT_MS = 60_000

const ROUNDS = 5

function elapsedOf(run: () => unknown): number {
  const startedAt = performance.now()
  run()
  return performance.now() - startedAt
}

function medianOf(values: readonly number[]): number {
  return values.toSorted((left, right) => left - right)[Math.floor(values.length / 2)] ?? 0
}

/**
 * Quantas vezes `target` custa `baseline`, com as duas medidas intercaladas no mesmo processo: a
 * carga da máquina pesa sobre as duas por igual, e a razão sobrevive a ela quando o absoluto não.
 */
export function measureMedianRatio(input: {
  readonly baseline: () => unknown
  readonly target: () => unknown
}): number {
  input.target()
  input.baseline()
  const targetMs: number[] = []
  const baselineMs: number[] = []
  for (let round = 0; round < ROUNDS; round += 1) {
    baselineMs.push(elapsedOf(input.baseline))
    targetMs.push(elapsedOf(input.target))
  }

  return medianOf(targetMs) / medianOf(baselineMs)
}
