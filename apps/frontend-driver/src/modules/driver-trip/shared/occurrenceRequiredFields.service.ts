/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { OccurrenceRequirements } from './occurrenceRequirements.service'

/** Spec 247 (T7.2, B1c): o tipo exige algo do motorista — só então "tudo preenchido" quer dizer alguma coisa. */
export function hasRequiredOccurrenceField(
  requirements: OccurrenceRequirements | undefined,
): boolean {
  if (requirements === undefined) return false
  return [
    requirements.declaredAmountMode,
    requirements.itemsMode,
    requirements.noteMode,
    requirements.photoMode,
    requirements.referenceNumberMode,
    requirements.signatureMode,
  ].includes('required')
}
