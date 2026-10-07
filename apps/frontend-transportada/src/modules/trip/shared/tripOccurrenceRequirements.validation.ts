/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DECLARED_AMOUNT_SCOPES,
  OCCURRENCE_ATTACHMENT_MODES,
  RETURN_REQUIREMENT_LABEL_MAX_LENGTH,
} from './occurrence.constant'
import type { TripOccurrenceRequirements } from './tripOccurrenceFeed.service'
import { isOneOf, isRecord, isString } from './tripGuards.validation'

function isLabel(value: unknown): boolean {
  return isString(value) && value.length > 0 && value.length <= RETURN_REQUIREMENT_LABEL_MAX_LENGTH
}

/** Spec 247 T7.2b: o requisito efetivo do tipo, aditivo no detalhe — vocabulário e faixa como o contrato da API. */
export function isOccurrenceRequirements(value: unknown): value is TripOccurrenceRequirements {
  return (
    isRecord(value) &&
    isOneOf(value.referenceNumberMode, OCCURRENCE_ATTACHMENT_MODES) &&
    isLabel(value.referenceNumberLabel) &&
    isOneOf(value.declaredAmountMode, OCCURRENCE_ATTACHMENT_MODES) &&
    isOneOf(value.declaredAmountScope, DECLARED_AMOUNT_SCOPES) &&
    isLabel(value.declaredAmountLabel) &&
    isOneOf(value.itemsMode, OCCURRENCE_ATTACHMENT_MODES)
  )
}
