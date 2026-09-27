/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useCaptureRegistration } from './useCaptureRegistration.hook'
import { usePhotoPreviewUrl } from './usePhotoPreviewUrl.hook'
import type {
  DriverOccurrencePhoto,
  DriverOccurrenceType,
  DriverOccurrenceTypesState,
  DriverReturnReason,
} from '../shared/driverTrip.types'
import {
  isOccurrencePhotoWithinLimit,
  listAvailableOccurrenceTypes,
  listMissingNotDeliveredFields,
  type NotDeliveredDraft,
  type NotDeliveredField,
} from '../shared/notDelivered.service'
import { reduceOccurrencePhotoToJpeg } from '../shared/occurrencePhotoImage.service'

/** O que acontece com a foto escolhida antes de ela virar anexo. */
export type NotDeliveredPhotoState = 'failed' | 'idle' | 'reading' | 'too-large'

export type NotDeliveredForm = Readonly<{
  availableTypes: readonly DriverOccurrenceType[] | undefined
  canConfirm: boolean
  draft: NotDeliveredDraft
  handleNoteChange: (note: string) => void
  handleOccurrenceTypeSelect: (occurrenceTypeId: string) => void
  handlePhotoSelect: (file: File) => void
  handleReasonSelect: (reason: DriverReturnReason) => void
  isNoteRequired: boolean
  missing: readonly NotDeliveredField[]
  photoPreviewUrl: string | undefined
  photoState: NotDeliveredPhotoState
}>

/**
 * Spec 179 (T302): o estado do "Não entreguei" — motivo, tipo, foto e observação — e o veredito do
 * serviço sobre o que falta. A foto é reencodada aqui (JPEG, sem EXIF, até 512 KiB) antes de virar
 * anexo; acima do teto ela não entra, e a tela diz por quê.
 */
export function useNotDeliveredForm(occurrenceTypes: DriverOccurrenceTypesState): NotDeliveredForm {
  const [reason, setReason] = useState<DriverReturnReason | undefined>(undefined)
  const [occurrenceTypeId, setOccurrenceTypeId] = useState<string | undefined>(undefined)
  const [note, setNote] = useState('')
  const [photo, setPhoto] = useState<DriverOccurrencePhoto | undefined>(undefined)
  const [photoState, setPhotoState] = useState<NotDeliveredPhotoState>('idle')
  const photoPreview = usePhotoPreviewUrl()

  /** Plan D2: o formulário aberto é captura — nem o SW novo nem a reautenticação navegam no meio. */
  useCaptureRegistration('occurrence-dialog', true)

  const draft: NotDeliveredDraft = {
    note,
    occurrenceTypeId,
    photo,
    reason,
  }
  const missing = listMissingNotDeliveredFields({ draft, occurrenceTypes })
  const availableTypes = listAvailableOccurrenceTypes(occurrenceTypes)
  const selectedType = availableTypes?.find((type) => type.id === occurrenceTypeId)

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
    availableTypes,
    canConfirm: missing.length === 0,
    draft,
    handleNoteChange: setNote,
    handleOccurrenceTypeSelect: setOccurrenceTypeId,
    handlePhotoSelect: (file) => void readPhoto(file),
    handleReasonSelect: setReason,
    isNoteRequired: selectedType?.attachmentMode === 'required',
    missing,
    photoPreviewUrl: photoPreview.previewUrl,
    photoState,
  }
}
