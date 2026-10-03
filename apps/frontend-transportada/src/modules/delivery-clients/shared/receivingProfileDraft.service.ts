/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  PreviewItemField,
  ReceivingProfile,
  ReceivingProfileRules,
} from './receivingProfile.types'

export type ReceivingProfileDraft = Readonly<{
  arrivalReferencePattern: string
  deliveryDeadlineBusinessDays: string
  isEnabled: boolean
  matchWindowDays: string
  previewColumnMap: Readonly<Record<PreviewItemField, string>>
  previewEnabled: boolean
  previewSheetName: string
  requiresDamageCheck: boolean
  separationWindowHours: string
  weightTolerancePercent: string
}>

export function createReceivingProfileDraft(
  profile: ReceivingProfile | null,
): ReceivingProfileDraft {
  throw new Error(`NOT_IMPLEMENTED:${String(profile)}`)
}

export function toReceivingProfileRules(draft: ReceivingProfileDraft): ReceivingProfileRules {
  throw new Error(`NOT_IMPLEMENTED:${String(draft)}`)
}
