/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasKeys } from '@/modules/shared/objectKeys.service'

import {
  isDeliveryProofFieldSettings,
  type DeliveryProofFieldSettings,
  type DeliveryProofFieldSettingsWire,
} from './deliveryProofSettings.service'
import { OCCURRENCE_ATTACHMENT_MODES, OCCURRENCE_TYPE_FLOWS } from './occurrence.constant'
import type { OccurrenceAttachmentMode, OccurrenceTypeFlow } from './occurrence.constant'
import { isRecord, isString } from './tripGuards.validation'

/** Spec 218 RF-E1: a tela de verificação — a rota é `settings.manage`, sem escrever nada. */
export const SETTINGS_RESOLUTION_PATH = '/company-settings/settings-resolution'

const SETTINGS_RESOLUTION_OCCURRENCE_TYPE_KEYS = [
  'attachmentMode',
  'flow',
  'id',
  'name',
  'stage',
] as const

/**
 * Spec 246 (RF12, ADR-0081 §9): os campos resolvidos que a API passa a mandar por tipo, e a camada
 * que decidiu cada um. Aditivos — ausentes são API anterior.
 */
const SETTINGS_RESOLUTION_OPTIONAL_KEYS = [
  'itemsMinimumCount',
  'itemsMode',
  'noteMode',
  'photoMinimumCount',
  'photoMode',
  'signatureMode',
  'sources',
] as const

export type SettingsResolutionOccurrenceType = Readonly<{
  attachmentMode: OccurrenceAttachmentMode
  flow: OccurrenceTypeFlow
  id: string
  itemsMinimumCount?: null | number
  itemsMode?: OccurrenceAttachmentMode
  name: string
  noteMode?: OccurrenceAttachmentMode
  photoMinimumCount?: number
  photoMode?: OccurrenceAttachmentMode
  signatureMode?: OccurrenceAttachmentMode
  sources?: Readonly<Record<string, string>>
  /** RF-E1 só devolve tipos de rua — mesmo recorte de `listFieldOccurrenceTypes`. */
  stage: 'delivery'
}>

export type SettingsResolutionView = Readonly<{
  deliveryProof: DeliveryProofFieldSettings
  occurrenceTypes: readonly SettingsResolutionOccurrenceType[]
}>

export type SettingsResolutionViewWire = Readonly<{
  deliveryProof: DeliveryProofFieldSettingsWire
  occurrenceTypes: readonly SettingsResolutionOccurrenceType[]
}>

function isSettingsResolutionOccurrenceType(
  value: unknown,
): value is SettingsResolutionOccurrenceType {
  if (
    !hasKeys(value, {
      allowed: [...SETTINGS_RESOLUTION_OCCURRENCE_TYPE_KEYS, ...SETTINGS_RESOLUTION_OPTIONAL_KEYS],
      required: SETTINGS_RESOLUTION_OCCURRENCE_TYPE_KEYS,
    })
  ) {
    return false
  }
  return (
    OCCURRENCE_ATTACHMENT_MODES.includes(value.attachmentMode as OccurrenceAttachmentMode) &&
    OCCURRENCE_TYPE_FLOWS.includes(value.flow as OccurrenceTypeFlow) &&
    isString(value.id) &&
    isString(value.name) &&
    value.stage === 'delivery'
  )
}

export function isSettingsResolutionView(value: unknown): value is SettingsResolutionViewWire {
  return (
    isRecord(value) &&
    isDeliveryProofFieldSettings(value.deliveryProof) &&
    Array.isArray(value.occurrenceTypes) &&
    value.occurrenceTypes.every(isSettingsResolutionOccurrenceType)
  )
}
