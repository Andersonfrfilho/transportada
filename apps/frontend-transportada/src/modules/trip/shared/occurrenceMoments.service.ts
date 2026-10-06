/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { OCCURRENCE_MOMENTS, type OccurrenceMoment } from './occurrence.constant'

export type OccurrenceMomentsProblem = 'documentAndStop' | 'empty'

/** Espelha a recusa da API: tipo sem momento não aparece para ninguém; nota e parada juntas duplicam o tipo no app. */
export function readOccurrenceMomentsProblem(
  moments: readonly OccurrenceMoment[],
): null | OccurrenceMomentsProblem {
  if (moments.length === 0) return 'empty'
  if (moments.includes('document') && moments.includes('stop')) return 'documentAndStop'
  return null
}

/** O seletor devolve texto livre: só os momentos conhecidos passam, sempre na ordem canônica. */
export function toOccurrenceMoments(values: readonly string[]): readonly OccurrenceMoment[] {
  return OCCURRENCE_MOMENTS.filter((moment) => values.includes(moment))
}
