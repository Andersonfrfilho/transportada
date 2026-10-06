/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  OCCURRENCE_ATTACHMENT_MODES,
  OCCURRENCE_ITEMS_MODES,
  OCCURRENCE_PHOTO_MINIMUM_COUNT,
} from './occurrence.constant'
import type {
  OccurrenceAttachmentOverrides,
  OccurrenceAttachmentOverridesByType,
} from './occurrenceType.types'
import { isOneOf, isRecord, isString } from './tripGuards.validation'

function isNullOrAbsent(value: unknown): boolean {
  return value === undefined || value === null
}

function isInteger(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

/**
 * Spec 246 D-a: os cinco campos novos da exceção são modo-ou-nulo (nulo herda do tipo). Ausente é
 * API anterior ao campo e passa — a leitura não inventa valor que a API não mandou.
 */
function hasValidRequirementFields(value: Record<string, unknown>): boolean {
  return (
    (isNullOrAbsent(value.noteMode) || isOneOf(value.noteMode, OCCURRENCE_ATTACHMENT_MODES)) &&
    (isNullOrAbsent(value.signatureMode) ||
      isOneOf(value.signatureMode, OCCURRENCE_ATTACHMENT_MODES)) &&
    (isNullOrAbsent(value.itemsMode) || isOneOf(value.itemsMode, OCCURRENCE_ITEMS_MODES)) &&
    (isNullOrAbsent(value.photoMinimumCount) ||
      isInteger(
        value.photoMinimumCount,
        OCCURRENCE_PHOTO_MINIMUM_COUNT.min,
        OCCURRENCE_PHOTO_MINIMUM_COUNT.max,
      )) &&
    (isNullOrAbsent(value.itemsMinimumCount) ||
      isInteger(value.itemsMinimumCount, 1, Number.MAX_SAFE_INTEGER))
  )
}

function isContractorOverride(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(value.attachmentMode, OCCURRENCE_ATTACHMENT_MODES) &&
    isString(value.contractorId) &&
    hasValidRequirementFields(value)
  )
}

function isRecipientOverride(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOneOf(value.attachmentMode, OCCURRENCE_ATTACHMENT_MODES) &&
    isString(value.taxId) &&
    hasValidRequirementFields(value)
  )
}

function isOverridePair(input: unknown): input is Record<string, unknown> & {
  contractorOverrides: OccurrenceAttachmentOverrides['contractorOverrides']
  recipientOverrides: OccurrenceAttachmentOverrides['recipientOverrides']
} {
  return (
    isRecord(input) &&
    Array.isArray(input.contractorOverrides) &&
    Array.isArray(input.recipientOverrides) &&
    input.contractorOverrides.every(isContractorOverride) &&
    input.recipientOverrides.every(isRecipientOverride)
  )
}

/** Spec 218 RF-B3: `{ contractorOverrides, recipientOverrides }`; `undefined` é resposta inválida. */
export function readOccurrenceAttachmentOverrides(
  input: unknown,
): OccurrenceAttachmentOverrides | undefined {
  if (!isOverridePair(input)) return undefined
  return {
    contractorOverrides: input.contractorOverrides,
    recipientOverrides: input.recipientOverrides,
  }
}

/** Spec 246 RF11c: `{ overridesByType: [{ occurrenceTypeId, ... }] }`; `undefined` é inválida. */
export function readOccurrenceAttachmentOverridesBatch(
  input: unknown,
): OccurrenceAttachmentOverridesByType | undefined {
  if (!isRecord(input) || !Array.isArray(input.overridesByType)) return undefined
  const groups: unknown[] = input.overridesByType
  const result: OccurrenceAttachmentOverridesByType[number][] = []
  for (const group of groups) {
    if (!isOverridePair(group) || !isString(group.occurrenceTypeId)) return undefined
    result.push({
      contractorOverrides: group.contractorOverrides,
      occurrenceTypeId: group.occurrenceTypeId,
      recipientOverrides: group.recipientOverrides,
    })
  }
  return result
}
