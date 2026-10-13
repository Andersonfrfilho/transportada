/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b: o nome do motorista na lista do escritório é curto, como o rótulo do assunto.
 */
import { DRIVER_SUBJECT_RECIPIENT_NAME_MAX_LENGTH } from './driver-subject-conversation.constant.js'

export function shortenDriverName(name: null | string): null | string {
  const trimmed = name?.trim() ?? ''
  if (trimmed === '') return null
  if (trimmed.length <= DRIVER_SUBJECT_RECIPIENT_NAME_MAX_LENGTH) return trimmed
  return `${trimmed.slice(0, DRIVER_SUBJECT_RECIPIENT_NAME_MAX_LENGTH - 1).trimEnd()}…`
}
