/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * D4: o feriado nacional não é importado. A rotina só confere se o que o fornecedor lista como
 * `NACIONAL` bate com o calendário do código e conta a diferença (`national_mismatch`) — nunca grava.
 */
export function countNationalMismatch(input: {
  readonly code: readonly string[]
  readonly provider: readonly string[]
}): number {
  const code = new Set(input.code)
  const provider = new Set(input.provider)
  let mismatch = 0

  for (const date of code) if (!provider.has(date)) mismatch += 1
  for (const date of provider) if (!code.has(date)) mismatch += 1

  return mismatch
}
