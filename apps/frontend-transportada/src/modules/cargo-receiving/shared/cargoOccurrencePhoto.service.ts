/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  buildOccurrencePhotoAttachment,
  type OccurrencePhotoAttachment,
} from '@/modules/trip/shared/occurrencePhotoImage.service'

/**
 * A redução da foto (lado maior de 1600 px, JPEG até ~400 KiB, EXIF descartado pelo canvas) é a do galpão: o
 * serviço é puro, sem componente nem hook do `trip`. Mora atrás deste arquivo para o teste de DOM trocá-lo —
 * o happy-dom não tem canvas.
 */
export function prepareOccurrencePhoto(file: File): Promise<OccurrencePhotoAttachment> {
  return buildOccurrencePhotoAttachment(file)
}
