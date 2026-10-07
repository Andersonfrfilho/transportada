/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { usePhotoPreviewUrl } from './usePhotoPreviewUrl.hook'
import type { DriverOccurrenceSignature } from '../shared/driverTrip.types'

/** O nome que o `SignaturePad` do comprovante já dá ao PNG que exporta. */
const SIGNATURE_FILE_NAME = 'assinatura.png'

export type OccurrenceSignatureState = Readonly<{
  handleCancel: () => void
  handleConfirm: (blob: Blob) => void
  handleOpen: () => void
  /** O `SignaturePad` só existe montado enquanto o motorista desenha. */
  isOpen: boolean
  previewUrl: string | undefined
  signature: DriverOccurrenceSignature | undefined
}>

/**
 * Spec 246 (RF7, RF9): a assinatura da ocorrência fica **no aparelho** até a fila — o `Blob` entra no
 * item da ocorrência (209 D1), nunca no comprovante da nota.
 */
export function useOccurrenceSignature(): OccurrenceSignatureState {
  const [signature, setSignature] = useState<DriverOccurrenceSignature | undefined>(undefined)
  const [isOpen, setIsOpen] = useState(false)
  const preview = usePhotoPreviewUrl()

  function handleConfirm(blob: Blob): void {
    preview.showPhoto(blob)
    setSignature({ blob, fileName: SIGNATURE_FILE_NAME })
    setIsOpen(false)
  }

  return {
    handleCancel: () => setIsOpen(false),
    handleConfirm,
    handleOpen: () => setIsOpen(true),
    isOpen,
    previewUrl: preview.previewUrl,
    signature,
  }
}
