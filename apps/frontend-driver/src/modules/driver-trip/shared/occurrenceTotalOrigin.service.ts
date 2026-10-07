/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { OccurrenceValues } from './occurrenceDraftValues.types'

/**
 * Spec 247 (T7.2, B1b, RF9): de onde vem o total que vai no e-mail — o valor pago da ocorrência, os
 * valores pagos digitados por linha (o digitado vence a soma da linha) ou a soma calculada pela nota.
 */
export type OccurrenceTotalOrigin =
  | Readonly<{ kind: 'calculated' | 'occurrence' | 'typed' }>
  | Readonly<{ kind: 'mixed'; total: number; typed: number }>

export function resolveOccurrenceTotalOrigin(
  values: Pick<OccurrenceValues, 'lines' | 'payload' | 'totals'>,
): OccurrenceTotalOrigin | undefined {
  if (values.totals === undefined) return undefined
  if (values.payload.declaredAmount !== undefined) return { kind: 'occurrence' }

  const summed = values.lines.filter((line) => line.isSelected && line.quantity !== undefined)
  if (summed.length === 0) return undefined

  const typed = summed.filter((line) => line.declaredAmount !== undefined).length
  if (typed === 0) return { kind: 'calculated' }
  return typed === summed.length
    ? { kind: 'typed' }
    : { kind: 'mixed', total: summed.length, typed }
}
