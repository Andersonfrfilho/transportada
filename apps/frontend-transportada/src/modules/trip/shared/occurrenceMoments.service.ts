/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  OCCURRENCE_MOMENTS,
  TRIP_OCCURRENCE_STAGE,
  type OccurrenceMoment,
  type OccurrenceType,
} from './occurrence.constant'

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

/** API anterior ao campo `moments`: o grupo e o fluxo dizem em que momento o tipo vale. */
export function resolveOccurrenceMoments(
  type: Pick<OccurrenceType, 'flow' | 'moments' | 'stage'>,
): readonly OccurrenceMoment[] {
  if (type.moments !== undefined) return type.moments
  if (type.stage === TRIP_OCCURRENCE_STAGE.separation) return ['separation']
  return [type.flow === 'stop' ? 'stop' : 'document']
}
