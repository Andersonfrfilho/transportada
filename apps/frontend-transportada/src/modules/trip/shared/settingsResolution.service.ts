/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasKeys } from '@/modules/shared/objectKeys.service'

import {
  isDeliveryProofFieldSettings,
  type DeliveryProofFieldSettings,
  type DeliveryProofFieldSettingsWire,
} from './deliveryProofSettings.service'
import { OCCURRENCE_ATTACHMENT_MODES, OCCURRENCE_TYPE_FLOWS } from './occurrence.constant'
import type {
  DeclaredAmountScope,
  OccurrenceAttachmentMode,
  OccurrenceTypeFlow,
} from './occurrence.constant'
import { hasValidReturnRequirementFields } from './returnRequirementFields.validation'
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
  /** Spec 247 TP.2: os requisitos efetivos da devolução e a camada de cada um. */
  'declaredAmountLabel',
  'declaredAmountMode',
  'declaredAmountScope',
  'iconName',
  'itemsMinimumCount',
  'itemsMode',
  'noteMode',
  'photoMinimumCount',
  'photoMode',
  'referenceNumberLabel',
  'referenceNumberMode',
  'signatureMode',
  'sources',
] as const

export type SettingsResolutionOccurrenceType = Readonly<{
  attachmentMode: OccurrenceAttachmentMode
  declaredAmountLabel?: string
  declaredAmountMode?: OccurrenceAttachmentMode
  declaredAmountScope?: DeclaredAmountScope
  flow: OccurrenceTypeFlow
  iconName?: null | string
  id: string
  itemsMinimumCount?: null | number
  itemsMode?: OccurrenceAttachmentMode
  name: string
  noteMode?: OccurrenceAttachmentMode
  photoMinimumCount?: number
  photoMode?: OccurrenceAttachmentMode
  referenceNumberLabel?: string
  referenceNumberMode?: OccurrenceAttachmentMode
  signatureMode?: OccurrenceAttachmentMode
  sources?: Readonly<
    Partial<
      Record<
        | 'declaredAmountLabel'
        | 'declaredAmountMode'
        | 'declaredAmountScope'
        | 'itemsMinimumCount'
        | 'itemsMode'
        | 'noteMode'
        | 'photoMinimumCount'
        | 'photoMode'
        | 'referenceNumberLabel'
        | 'referenceNumberMode'
        | 'signatureMode',
        string
      >
    >
  >
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
    value.stage === 'delivery' &&
    hasValidReturnRequirementFields(value) &&
    (value.sources === undefined ||
      (isRecord(value.sources) && Object.values(value.sources).every(isString)))
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
