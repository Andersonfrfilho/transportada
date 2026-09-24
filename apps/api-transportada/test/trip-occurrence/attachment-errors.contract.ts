/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T4: os três erros novos da foto da ocorrência de galpão — código, status e a garantia de
 * que a mensagem nunca carrega o que a spec proíbe (id de empresa/ocorrência, nome, CNPJ).
 */
import { describe, expect, test } from 'bun:test'

import {
  OccurrencePhotoRequiredError,
  TripOccurrenceAttachmentLimitError,
  TripOccurrenceNotFoundError,
} from '../../src/trips/domain/trip.error.js'

describe('erros novos da foto da ocorrência (spec 161 T4)', () => {
  test('OccurrencePhotoRequiredError é 422 sem PII', () => {
    const error = new OccurrencePhotoRequiredError()

    expect(error.code).toBe('OCCURRENCE_PHOTO_REQUIRED')
    expect(error.status).toBe(422)
    expect(error.message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
  })

  test('TripOccurrenceAttachmentLimitError é 409 sem PII', () => {
    const error = new TripOccurrenceAttachmentLimitError()

    expect(error.code).toBe('TRIP_OCCURRENCE_ATTACHMENT_LIMIT')
    expect(error.status).toBe(409)
    expect(error.message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
  })

  test('TripOccurrenceNotFoundError é 404 sem PII', () => {
    const error = new TripOccurrenceNotFoundError()

    expect(error.code).toBe('TRIP_OCCURRENCE_NOT_FOUND')
    expect(error.status).toBe(404)
    expect(error.message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i)
  })
})
