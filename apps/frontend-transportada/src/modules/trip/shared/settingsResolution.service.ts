/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

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

export type SettingsResolutionOccurrenceType = Readonly<{
  attachmentMode: OccurrenceAttachmentMode
  flow: OccurrenceTypeFlow
  id: string
  name: string
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
  if (!hasExactKeys(value, SETTINGS_RESOLUTION_OCCURRENCE_TYPE_KEYS)) return false
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
