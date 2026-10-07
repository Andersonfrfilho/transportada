/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (RF12/P5, revisão do painel A3): os seis campos que a verificação mostra por tipo — o que
 * o app do motorista aplicaria — e a camada que decidiu cada um (tipo, contratante, destinatário ou padrão).
 */
import { OCCURRENCE_ATTACHMENT_MODE, type OccurrenceAttachmentMode } from './occurrence.constant'
import type { SettingsResolutionOccurrenceType } from './settingsResolution.service'

export const RESOLVED_FIELD_KEYS = [
  'photoMode',
  'noteMode',
  'signatureMode',
  'itemsMode',
  'photoMinimumCount',
  'itemsMinimumCount',
] as const

export type ResolvedFieldKey = (typeof RESOLVED_FIELD_KEYS)[number]

export type ResolvedFieldValue =
  | Readonly<{ kind: 'allItems' }>
  | Readonly<{ count: number; kind: 'atLeast' }>
  | Readonly<{ count: number; kind: 'photoCount' }>
  | Readonly<{ kind: 'mode'; mode: OccurrenceAttachmentMode }>
  | Readonly<{ kind: 'notApplicable' }>

export type ResolvedFieldView = Readonly<{
  /** A camada que decidiu; ausente é API anterior ao campo `sources`. */
  layer: string | undefined
  key: ResolvedFieldKey
  value: ResolvedFieldValue
}>

const NOT_APPLICABLE: ResolvedFieldValue = { kind: 'notApplicable' }

function readMode(
  mode: OccurrenceAttachmentMode | undefined,
  fallback: OccurrenceAttachmentMode,
): ResolvedFieldValue {
  return { kind: 'mode', mode: mode ?? fallback }
}

/** Cada mínimo só existe com o seu campo obrigatório; fora disso a tela diz "não se aplica", e não um número solto. */
function readValue(
  type: SettingsResolutionOccurrenceType,
  key: ResolvedFieldKey,
): ResolvedFieldValue {
  const off = OCCURRENCE_ATTACHMENT_MODE.off
  const photoMode = type.photoMode ?? type.attachmentMode
  if (key === 'photoMode') return readMode(type.photoMode, type.attachmentMode)
  if (key === 'noteMode') return readMode(type.noteMode, OCCURRENCE_ATTACHMENT_MODE.optional)
  if (key === 'signatureMode') return readMode(type.signatureMode, off)
  if (key === 'itemsMode') return readMode(type.itemsMode, OCCURRENCE_ATTACHMENT_MODE.optional)
  if (key === 'photoMinimumCount') {
    if (photoMode !== OCCURRENCE_ATTACHMENT_MODE.required) return NOT_APPLICABLE
    return { count: type.photoMinimumCount ?? 1, kind: 'photoCount' }
  }
  if (type.itemsMode !== OCCURRENCE_ATTACHMENT_MODE.required) return NOT_APPLICABLE
  return type.itemsMinimumCount === null || type.itemsMinimumCount === undefined
    ? { kind: 'allItems' }
    : { count: type.itemsMinimumCount, kind: 'atLeast' }
}

export function buildResolvedFields(
  input: Readonly<{ generalLayer?: string; type: SettingsResolutionOccurrenceType }>,
): readonly ResolvedFieldView[] {
  return RESOLVED_FIELD_KEYS.map((key) => ({
    key,
    layer: input.type.sources?.[key] ?? input.generalLayer,
    value: readValue(input.type, key),
  }))
}
