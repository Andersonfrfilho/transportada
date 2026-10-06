/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { LOCATION_RETENTION_IMPACT_CAP } from './location-retention.constant.js'

export type ImpactCount = { readonly capped: boolean; readonly count: number }

/** A consulta lê no máximo `CAP + 1` linhas: uma a mais do que o teto é o que prova "há mais". */
export function summarizeImpactCount(rawCount: number): ImpactCount {
  if (rawCount > LOCATION_RETENTION_IMPACT_CAP) {
    return { capped: true, count: LOCATION_RETENTION_IMPACT_CAP }
  }
  return { capped: false, count: rawCount }
}

export function sumImpactCounts(entries: readonly ImpactCount[]): ImpactCount {
  return {
    capped: entries.some((entry) => entry.capped),
    count: entries.reduce((total, entry) => total + entry.count, 0),
  }
}
