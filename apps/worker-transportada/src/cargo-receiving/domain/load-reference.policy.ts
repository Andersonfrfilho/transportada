/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a (ADR-0094 §2): o `NroCarga` sai do `infCpl` pelo padrão do perfil. O texto é de
 * terceiro e o motor do Bun retrocede: o padrão passa de novo pelo filtro da gravação, a entrada é
 * cortada em 2 000 caracteres, e qualquer falha é "sem carga" — nunca uma exceção.
 */
import { findArrivalReferencePatternIssue } from './arrival-reference-pattern.policy.js'
import { LOAD_REFERENCE_INPUT_MAX_LENGTH } from './cargo-preview-matching.constant.js'

export function extractLoadReference(input: {
  readonly additionalInfo: string | undefined
  readonly pattern: string | null
}): string | undefined {
  const { additionalInfo, pattern } = input
  if (pattern === null || additionalInfo === undefined) return undefined
  try {
    if (findArrivalReferencePatternIssue(pattern) !== undefined) return undefined
    const match = new RegExp(pattern, 'u').exec(
      additionalInfo.slice(0, LOAD_REFERENCE_INPUT_MAX_LENGTH),
    )
    const value = match?.[1]?.trim()
    return value === undefined || value.length === 0 ? undefined : value
  } catch {
    return undefined
  }
}
