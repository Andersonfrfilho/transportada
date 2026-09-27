/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useCaptureRegistration } from './useCaptureRegistration.hook'
import { usePhotoPreviewUrl } from './usePhotoPreviewUrl.hook'
import type { DriverOccurrenceKind, DriverOccurrencePhoto } from '../shared/driverTrip.types'
import { isOccurrencePhotoWithinLimit } from '../shared/notDelivered.service'
import { reduceOccurrencePhotoToJpeg } from '../shared/occurrencePhotoImage.service'

/** O que acontece com a foto escolhida antes de ela entrar na fila. */
export type StopOccurrencePhotoState = 'failed' | 'idle' | 'reading' | 'too-large'

export type StopOccurrenceDraft = Readonly<{
  description: string
  kind: DriverOccurrenceKind
  photo: DriverOccurrencePhoto | undefined
}>

export type StopOccurrenceForm = Readonly<{
  draft: StopOccurrenceDraft
  handleDescriptionChange: (description: string) => void
  handleKindSelect: (kind: DriverOccurrenceKind) => void
  handlePhotoSelect: (file: File) => void
  photoPreviewUrl: string | undefined
  photoState: StopOccurrencePhotoState
}>

/**
 * Spec 209: o estado do "Deu problema" — motivo, descrição e **uma** foto (D1). A foto é reencodada
 * aqui como a da 179 (JPEG, sem EXIF, até 512 KiB): acima do teto ela não entra, e a tela diz por
 * quê. Escolher outra substitui a anterior ("Refazer").
 */
export function useStopOccurrenceForm(): StopOccurrenceForm {
  const [kind, setKind] = useState<DriverOccurrenceKind>('long_wait')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<DriverOccurrencePhoto | undefined>(undefined)
  const [photoState, setPhotoState] = useState<StopOccurrencePhotoState>('idle')
  const photoPreview = usePhotoPreviewUrl()

  /** Plan D2 da 189: aberto é captura — navegar no meio do relato perdia o que já foi digitado. */
  useCaptureRegistration('occurrence-dialog', true)

  async function readPhoto(file: File): Promise<void> {
    setPhotoState('reading')
    try {
      const reduced = await reduceOccurrencePhotoToJpeg(file)
      if (!isOccurrencePhotoWithinLimit(reduced.blob)) {
        setPhotoState('too-large')
        return
      }
      photoPreview.showPhoto(reduced.blob)
      setPhoto(reduced)
      setPhotoState('idle')
    } catch {
      setPhotoState('failed')
    }
  }

  return {
    draft: { description, kind, photo },
    handleDescriptionChange: setDescription,
    handleKindSelect: setKind,
    handlePhotoSelect: (file) => void readPhoto(file),
    photoPreviewUrl: photoPreview.previewUrl,
    photoState,
  }
}
