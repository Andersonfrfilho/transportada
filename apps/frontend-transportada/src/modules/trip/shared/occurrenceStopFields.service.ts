/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 315 RF6: o que o tipo de parada pede de localização e de horário de chegada, e a espera mínima depois do
 * "Cheguei". Os dois modos usam o mesmo seletor de três estados dos outros campos; a espera mínima é uma escolha entre
 * valores prontos (como a trava do motorista). Quem decide se a tela oferece é o conjunto de momentos do tipo e o que a
 * API trouxe: API anterior aos campos não manda nenhum, e o `PUT` não os manda de volta.
 */
import {
  OCCURRENCE_ATTACHMENT_MODE,
  type OccurrenceAttachmentMode,
  type OccurrenceType,
} from './occurrence.constant'
import { resolveOccurrenceMoments } from './occurrenceMoments.service'
import type { OccurrenceTypeEdit } from './occurrenceTypeUpdate.service'

export const OCCURRENCE_STOP_FIELDS = ['location', 'arrivalTime', 'note'] as const

export type OccurrenceStopField = (typeof OCCURRENCE_STOP_FIELDS)[number]

/** As esperas mínimas oferecidas, em minutos. O valor gravado fora da lista aparece também. */
export const OCCURRENCE_MIN_WAIT_CHOICES = [15, 30, 45, 60, 90, 120] as const

export const OCCURRENCE_MIN_WAIT_OFF = 'off'

/**
 * Os campos que a tela oferece: só tipo com o momento "parada" e só o que a API trouxe. A observação entra aqui
 * apenas no tipo que não tem o momento "nota" — nele o seletor de observação já está na grade principal.
 */
export function readOccurrenceStopFields(type: OccurrenceType): readonly OccurrenceStopField[] {
  const moments = resolveOccurrenceMoments(type)
  if (!moments.includes('stop')) return []
  return [
    ...(type.locationMode === undefined ? [] : (['location'] as const)),
    ...(type.arrivalTimeMode === undefined ? [] : (['arrivalTime'] as const)),
    ...(type.noteMode === undefined || moments.includes('document') ? [] : (['note'] as const)),
  ]
}

export function readOccurrenceStopMode(
  type: OccurrenceType,
  field: OccurrenceStopField,
): OccurrenceAttachmentMode {
  const mode =
    field === 'location'
      ? type.locationMode
      : field === 'arrivalTime'
        ? type.arrivalTimeMode
        : type.noteMode
  return mode ?? OCCURRENCE_ATTACHMENT_MODE.off
}

/**
 * A edição do modo. Pedir o horário de chegada com a espera mínima ligada seria recusado pela API (a espera conta do
 * toque em "Cheguei"), então a tela desliga a espera na mesma edição.
 */
export function buildOccurrenceStopEdit(
  type: OccurrenceType,
  field: OccurrenceStopField,
  mode: OccurrenceAttachmentMode,
): OccurrenceTypeEdit {
  if (field === 'location') return { locationMode: mode }
  if (field === 'note') return { noteMode: mode }
  const hasMinWait =
    type.minWaitAfterArrivalMinutes !== undefined && type.minWaitAfterArrivalMinutes !== null
  return mode !== OCCURRENCE_ATTACHMENT_MODE.off && hasMinWait
    ? { arrivalTimeMode: mode, minWaitAfterArrivalMinutes: null }
    : { arrivalTimeMode: mode }
}

/** A edição da espera mínima: ligar a espera desliga o horário de chegada digitado, que a API recusaria junto. */
export function buildOccurrenceMinWaitEdit(value: string): OccurrenceTypeEdit {
  if (value === OCCURRENCE_MIN_WAIT_OFF) return { minWaitAfterArrivalMinutes: null }
  return {
    arrivalTimeMode: OCCURRENCE_ATTACHMENT_MODE.off,
    minWaitAfterArrivalMinutes: Number(value),
  }
}

/** A tela oferece a espera mínima onde há parada e a API a trouxe (o campo pode vir nulo). */
export function hasOccurrenceMinWait(type: OccurrenceType): boolean {
  return (
    resolveOccurrenceMoments(type).includes('stop') && type.minWaitAfterArrivalMinutes !== undefined
  )
}

/** As opções da espera mínima, com o valor gravado quando está fora da lista. */
export function listOccurrenceMinWaitChoices(type: OccurrenceType): readonly number[] {
  return [...new Set([...OCCURRENCE_MIN_WAIT_CHOICES, type.minWaitAfterArrivalMinutes ?? 0])]
    .filter((minutes) => minutes > 0)
    .toSorted((left, right) => left - right)
}
