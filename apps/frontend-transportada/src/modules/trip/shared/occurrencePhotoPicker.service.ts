/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CameraStreamStatus } from '@/components/ui/useCameraStream.hook'

/**
 * Spec 161 T23 (RF28/RF30/D3/D4): o degradê e o teto do `OccurrencePhotoPicker`, isolados do canvas
 * e da câmera para serem testáveis sem DOM — mesmo recorte de `FieldDeliveryCaptureStep`
 * (`showCamera`), mas nomeado para a tela de ocorrência.
 */

/** D12: teto de cinco fotos por ocorrência (mesmo teto do servidor, `OCCURRENCE_ATTACHMENT_LIMIT`). */
export const OCCURRENCE_PHOTO_LIMIT = 5

/**
 * `denied`/`unavailable` caem no seletor de arquivo (CA17); `idle`/`starting`/`ready` mostram a
 * câmera — o seletor de arquivo continua oferecido como alternativa mesmo com câmera disponível
 * (D4), só muda o que aparece primeiro.
 */
export function resolveOccurrencePhotoPickerShowsCamera(cameraStatus: CameraStreamStatus): boolean {
  return cameraStatus !== 'denied' && cameraStatus !== 'unavailable'
}

/** CA17: a sexta foto não é oferecida — nem pela câmera, nem pelo arquivo. */
export function canAddOccurrencePhoto(
  photoCount: number,
  limit: number = OCCURRENCE_PHOTO_LIMIT,
): boolean {
  return photoCount < limit
}

/** CA17: sem foto nenhuma o envio fica desabilitado — a ocorrência sempre nasce com prova. */
export function canSubmitOccurrenceWithPhotos(photoCount: number): boolean {
  return photoCount > 0
}
