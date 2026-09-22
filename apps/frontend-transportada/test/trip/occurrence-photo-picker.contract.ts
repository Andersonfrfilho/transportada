/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  canAddOccurrencePhoto,
  canSubmitOccurrenceWithPhotos,
  OCCURRENCE_PHOTO_LIMIT,
  resolveOccurrencePhotoPickerShowsCamera,
} from '../../src/modules/trip/shared/occurrencePhotoPicker.service'

describe('occurrencePhotoPicker.service', () => {
  test('CA17: denied e unavailable caem no seletor de arquivo, o resto mostra a câmera', () => {
    expect(resolveOccurrencePhotoPickerShowsCamera('denied')).toBe(false)
    expect(resolveOccurrencePhotoPickerShowsCamera('unavailable')).toBe(false)
    expect(resolveOccurrencePhotoPickerShowsCamera('idle')).toBe(true)
    expect(resolveOccurrencePhotoPickerShowsCamera('starting')).toBe(true)
    expect(resolveOccurrencePhotoPickerShowsCamera('ready')).toBe(true)
  })

  test('CA17: a sexta foto não é oferecida', () => {
    expect(OCCURRENCE_PHOTO_LIMIT).toBe(5)
    expect(canAddOccurrencePhoto(4)).toBe(true)
    expect(canAddOccurrencePhoto(5)).toBe(false)
    expect(canAddOccurrencePhoto(6)).toBe(false)
  })

  test('CA17: sem foto o envio fica desabilitado', () => {
    expect(canSubmitOccurrenceWithPhotos(0)).toBe(false)
    expect(canSubmitOccurrenceWithPhotos(1)).toBe(true)
    expect(canSubmitOccurrenceWithPhotos(5)).toBe(true)
  })
})
