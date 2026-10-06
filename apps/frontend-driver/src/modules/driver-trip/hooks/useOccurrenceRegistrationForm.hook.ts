/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { buildOccurrencePreview } from '../shared/occurrencePreview.service'
import type {
  OccurrencePhotoState,
  OccurrenceRegistrationForm,
  OccurrenceRegistrationFormParams,
} from '../shared/occurrenceRegistrationForm.types'
import { useCaptureRegistration } from './useCaptureRegistration.hook'
import {
  useOccurrenceSignature,
  type OccurrenceSignatureState,
} from './useOccurrenceSignature.hook'
import { usePhotoPreviewUrl } from './usePhotoPreviewUrl.hook'
import type {
  DriverOccurrencePhoto,
  DriverOccurrenceType,
  DriverOccurrenceTypesState,
  DriverTripDocument,
  DriverTripStop,
} from '../shared/driverTrip.types'
import { isOccurrencePhotoWithinLimit } from '../shared/notDelivered.service'
import {
  renderOccurrenceNoticePreview,
  type OccurrenceNoticePreview,
} from '../shared/occurrenceNoticePreview.service'
import {
  dispatchOccurrenceRegistration,
  type OccurrenceRegistrationHandlers,
} from '../shared/occurrenceDispatch.service'
import {
  canRegisterOccurrence,
  listMissingOccurrenceFields,
  resolveOccurrenceFlow,
  resolveOccurrenceTypesForDocument,
} from '../shared/occurrenceRegistration.service'
import { reduceOccurrencePhotoToJpeg } from '../shared/occurrencePhotoImage.service'
import {
  addOccurrencePhoto,
  resolveOccurrenceFieldVisibility,
  type OccurrenceFieldVisibility,
  type OccurrenceMissingField,
} from '../shared/occurrenceRequirements.service'

export type {
  OccurrenceRegistrationForm,
  OccurrenceRegistrationFormParams,
  OccurrencePhotoState,
} from '../shared/occurrenceRegistrationForm.types'

/**
 * Spec 218 (RF-A5): o estado do formulário único — o tipo, a descrição e a(s) foto(s) da ocorrência
 * (spec 209 D1), reduzidas no aparelho como a da 179 (JPEG, sem EXIF, até 512 KiB). Spec 246: mais
 * a assinatura e a nota inteira apontada, cada um só quando o tipo da nota o pede. O gate lê só o
 * que está no aparelho: capturou, habilita — o upload é da fila, depois.
 */
export function useOccurrenceRegistrationForm(
  params: OccurrenceRegistrationFormParams,
): OccurrenceRegistrationForm {
  const [occurrenceTypeId, setOccurrenceTypeId] = useState<string | undefined>(undefined)
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<readonly DriverOccurrencePhoto[]>([])
  const [photoState, setPhotoState] = useState<OccurrencePhotoState>('idle')
  const [isProductsMarked, setIsProductsMarked] = useState(false)
  const photoPreview = usePhotoPreviewUrl()
  const signature = useOccurrenceSignature()

  /** Plan D2 da 189: aberto é captura — navegar no meio do relato perdia o que já foi digitado. */
  useCaptureRegistration('occurrence-dialog', true)

  const types =
    params.occurrenceTypes.status === 'loaded'
      ? resolveOccurrenceTypesForDocument({
          document: params.document,
          tripWideTypes: params.occurrenceTypes.types,
        })
      : []
  const selectedType = types.find((type) => type.id === occurrenceTypeId)
  const visibility =
    selectedType === undefined ? undefined : resolveOccurrenceFieldVisibility(selectedType)
  /** Tipo `off` nunca leva foto — a escolhida para outro tipo fica para trás; o limite também corta. */
  const effectivePhotos =
    visibility?.rendersPhoto === true ? photos.slice(0, visibility.photoLimit) : []
  const effectiveSignature = visibility?.rendersSignature === true ? signature.signature : undefined
  const hasProducts = visibility?.rendersProducts === true && isProductsMarked
  const gateFacts = {
    hasNote: description.trim() !== '',
    hasPhoto: effectivePhotos.length > 0,
    hasProducts,
    hasSignature: effectiveSignature !== undefined,
    photoCount: effectivePhotos.length,
  }

  async function readPhoto(file: File): Promise<void> {
    setPhotoState('reading')
    try {
      const reduced = await reduceOccurrencePhotoToJpeg(file)
      if (!isOccurrencePhotoWithinLimit(reduced.blob)) {
        setPhotoState('too-large')
        return
      }
      photoPreview.showPhoto(reduced.blob)
      setPhotos((current) =>
        addOccurrencePhoto({ current, limit: visibility?.photoLimit ?? 1, photo: reduced }),
      )
      setPhotoState('idle')
    } catch {
      setPhotoState('failed')
    }
  }

  function handlePhotoRemove(): void {
    const remaining = effectivePhotos.slice(0, -1)
    const last = remaining.at(-1)
    if (last !== undefined) photoPreview.showPhoto(last.blob)
    setPhotos(remaining)
  }

  function handleRegister(): boolean {
    if (selectedType === undefined) return false
    const route = dispatchOccurrenceRegistration({
      documentId: params.document.id,
      draft: {
        description,
        extraPhotos: effectivePhotos.slice(1),
        hasProducts,
        photo: effectivePhotos[0],
        signature: effectiveSignature,
      },
      handlers: params.handlers,
      stopId: params.stop.id,
      type: selectedType,
    })
    return route !== 'blocked'
  }

  return {
    canRegister: canRegisterOccurrence({
      ...gateFacts,
      isPhotoReading: photoState === 'reading',
      type: selectedType,
    }),
    description,
    handleDescriptionChange: setDescription,
    handleProductsToggle: () => setIsProductsMarked((marked) => !marked),
    handlePhotoRemove,
    handlePhotoSelect: (file) => void readPhoto(file),
    handleRegister,
    handleTypeSelect: setOccurrenceTypeId,
    hasProducts,
    missingFields:
      selectedType === undefined
        ? []
        : listMissingOccurrenceFields({ ...gateFacts, type: selectedType }),
    photoPreviewUrl: photoPreview.previewUrl,
    photos: effectivePhotos,
    photoState,
    preview: buildOccurrencePreview({
      document: params.document,
      stop: params.stop,
      type: selectedType,
    }),
    selectedType,
    signature,
    types,
    visibility,
  }
}
