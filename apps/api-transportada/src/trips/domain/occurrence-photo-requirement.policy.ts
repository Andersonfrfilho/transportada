/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T203 (RF3) e spec 246 (RF1c, RF8): o que a foto obrigatória cobra do registro do
 * motorista. A exigência é do **tipo** (`attachmentMode`), nunca do nome dele; ausente é `'off'`.
 * Com a foto obrigatória: a observação, ao menos um anexo, e a quantidade de anexos ≥
 * `photoMinimumCount` — lido só aqui, com a foto obrigatória.
 */
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'
import { OCCURRENCE_PHOTO_MINIMUM_COUNT } from '../../shared/trip-occurrence.constant.js'
import {
  TripOccurrenceAttachmentRequiredError,
  TripOccurrenceNoteRequiredError,
  TripOccurrencePhotoMinimumNotMetError,
} from './trip.error.js'

export type DriverOccurrencePhotoRequirementInput = {
  readonly attachmentCount: number
  readonly attachmentMode: DeliveryProofFieldMode | undefined
  readonly note: string
  readonly photoMinimumCount: number | undefined
}

export function assertDriverOccurrencePhotoRequirement(
  input: DriverOccurrencePhotoRequirementInput,
): void {
  if ((input.attachmentMode ?? 'off') !== 'required') return
  if (input.note.trim() === '') throw new TripOccurrenceNoteRequiredError()
  if (input.attachmentCount === 0) throw new TripOccurrenceAttachmentRequiredError()
  const minimum = input.photoMinimumCount ?? OCCURRENCE_PHOTO_MINIMUM_COUNT.default
  if (input.attachmentCount < minimum) throw new TripOccurrencePhotoMinimumNotMetError()
}
