/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DECLARED_AMOUNT_SCOPES,
  OCCURRENCE_ATTACHMENT_MODES,
  RETURN_REQUIREMENT_LABEL_KEYS,
  RETURN_REQUIREMENT_LABEL_MAX_LENGTH,
  RETURN_REQUIREMENT_MODE_KEYS,
} from './occurrence.constant'
import { isOneOf, isString } from './tripGuards.validation'

function isReturnRequirementLabel(value: unknown): boolean {
  return isString(value) && value.length > 0 && value.length <= RETURN_REQUIREMENT_LABEL_MAX_LENGTH
}

/**
 * Spec 247 TP.1/TP.2: os requisitos efetivos da devolução são aditivos — ausentes são API
 * anterior; presentes, só no vocabulário e na faixa.
 */
export function hasValidReturnRequirementFields(value: Record<string, unknown>): boolean {
  return (
    RETURN_REQUIREMENT_MODE_KEYS.every(
      (key) => value[key] === undefined || isOneOf(value[key], OCCURRENCE_ATTACHMENT_MODES),
    ) &&
    RETURN_REQUIREMENT_LABEL_KEYS.every(
      (key) => value[key] === undefined || isReturnRequirementLabel(value[key]),
    ) &&
    (value.declaredAmountScope === undefined ||
      isOneOf(value.declaredAmountScope, DECLARED_AMOUNT_SCOPES))
  )
}
