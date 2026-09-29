/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useCaptureRegistration } from './useCaptureRegistration.hook'
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
  canRegisterOccurrence,
  dispatchOccurrenceRegistration,
  listMissingOccurrenceFields,
  resolveOccurrenceAttachmentMode,
  resolveOccurrenceFlow,
  resolveOccurrenceTypesForDocument,
  type OccurrenceRegistrationHandlers,
} from '../shared/occurrenceRegistration.service'
import { reduceOccurrencePhotoToJpeg } from '../shared/occurrencePhotoImage.service'
import type { ProofFieldKey } from '../shared/proofFormPlan.service'

/** O que acontece com a foto escolhida antes de ela entrar na fila. */
export type OccurrencePhotoState = 'failed' | 'idle' | 'reading' | 'too-large'

export type OccurrenceRegistrationFormParams = Readonly<{
  document: DriverTripDocument
  handlers: OccurrenceRegistrationHandlers
  occurrenceTypes: DriverOccurrenceTypesState
  stop: DriverTripStop
}>

export type OccurrenceRegistrationForm = Readonly<{
  canRegister: boolean
  description: string
  handleDescriptionChange: (description: string) => void
  handlePhotoSelect: (file: File) => void
  /** Registra pela rota do `flow` — só chamado com `canRegister`, o botão segura o resto. */
  handleRegister: () => void
  handleTypeSelect: (occurrenceTypeId: string) => void
  missingFields: readonly ProofFieldKey[]
  photo: DriverOccurrencePhoto | undefined
  photoPreviewUrl: string | undefined
  photoState: OccurrencePhotoState
  /**
   * A prévia do aviso da parada — ausente quando o tipo não é de parada (o aviso da nota é outro).
   * `null` dentro dela é "este motivo não gera aviso", e a tela diz isso.
   */
  preview: Readonly<{ notice: OccurrenceNoticePreview | null }> | undefined
  /** `off` não oferece foto: o bloco de captura nem aparece. */
  rendersPhoto: boolean
  selectedType: DriverOccurrenceType | undefined
  types: readonly DriverOccurrenceType[]
}>

function buildPreview(input: {
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

/**
 * Spec 218 (RF-A5): o estado do formulário único — o tipo, a descrição e **uma** foto da
 * ocorrência (spec 209 D1), reduzida no aparelho como a da 179 (JPEG, sem EXIF, até 512 KiB). O
 * gate lê só o que está no aparelho: capturou, habilita — o upload é da fila, depois.
 */
export function useOccurrenceRegistrationForm(
  params: OccurrenceRegistrationFormParams,
): OccurrenceRegistrationForm {
  const [occurrenceTypeId, setOccurrenceTypeId] = useState<string | undefined>(undefined)
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<DriverOccurrencePhoto | undefined>(undefined)
  const [photoState, setPhotoState] = useState<OccurrencePhotoState>('idle')
  const photoPreview = usePhotoPreviewUrl()

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
  const rendersPhoto =
    selectedType !== undefined && resolveOccurrenceAttachmentMode(selectedType) !== 'off'
  /** Tipo `off` nunca leva foto — a escolhida para outro tipo fica para trás. */
  const effectivePhoto = rendersPhoto ? photo : undefined
  const hasPhoto = effectivePhoto !== undefined

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

  function handleRegister(): void {
    if (selectedType === undefined) return
    dispatchOccurrenceRegistration({
      documentId: params.document.id,
      draft: { description, photo: effectivePhoto },
      handlers: params.handlers,
      stopId: params.stop.id,
      type: selectedType,
    })
  }

  return {
    canRegister: canRegisterOccurrence({
      hasPhoto,
      isPhotoReading: photoState === 'reading',
      type: selectedType,
    }),
    description,
    handleDescriptionChange: setDescription,
    handlePhotoSelect: (file) => void readPhoto(file),
    handleRegister,
    handleTypeSelect: setOccurrenceTypeId,
    missingFields:
      selectedType === undefined
        ? []
        : listMissingOccurrenceFields({ hasPhoto, type: selectedType }),
    photo: effectivePhoto,
    photoPreviewUrl: photoPreview.previewUrl,
    photoState,
    preview: buildPreview({ document: params.document, stop: params.stop, type: selectedType }),
    rendersPhoto,
    selectedType,
    types,
  }
}
