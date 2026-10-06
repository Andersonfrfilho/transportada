/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverOccurrenceType, DriverTripDocument, DriverTripStop } from './driverTrip.types'
import { renderOccurrenceNoticePreview } from './occurrenceNoticePreview.service'
import type { OccurrenceRegistrationForm } from './occurrenceRegistrationForm.types'
import { resolveOccurrenceFlow } from './occurrenceRegistration.service'

export function buildOccurrencePreview(input: {
  readonly document: DriverTripDocument
  readonly stop: DriverTripStop
  readonly type: DriverOccurrenceType | undefined
}): OccurrenceRegistrationForm['preview'] {
  const { type } = input
  if (type === undefined || resolveOccurrenceFlow(type) !== 'stop' || type.stopKind == null) {
    return undefined
  }
  return {
    notice: renderOccurrenceNoticePreview({
      documentLabel: input.document.number,
      kind: type.stopKind,
      occurredAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      stopLabel: input.stop.label,
    }),
  }
}
