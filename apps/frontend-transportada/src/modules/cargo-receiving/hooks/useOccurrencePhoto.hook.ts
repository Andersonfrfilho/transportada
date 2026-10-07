/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

import { CARGO_OCCURRENCE_IMAGE_MIME_PREFIX } from '../shared/cargoOccurrence.constant'
import type { OccurrenceDraftPhoto } from '../shared/cargoOccurrenceForm.validation'
import { prepareOccurrencePhoto } from '../shared/cargoOccurrencePhoto.service'

export type OccurrencePhotoFailure = 'photoNotImage' | 'photoUnreadable'

export type OccurrencePhotoController = Readonly<{
  failure: OccurrencePhotoFailure | undefined
  isPreparing: boolean
  previewUrl: string | undefined
  setFile: (file: File) => void
}>

/**
 * A foto escolhida ou tirada: só imagem, reduzida no aparelho antes de entrar no rascunho (o `id` da escolha é
 * o que a impressão do envio usa). A URL de pré-visualização é revogada ao trocar e ao fechar o formulário.
 */
export function useOccurrencePhoto(
  onPrepared: (photo: OccurrenceDraftPhoto) => void,
): OccurrencePhotoController {
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined)
  const [failure, setFailure] = useState<OccurrencePhotoFailure | undefined>(undefined)
  const [isPreparing, setIsPreparing] = useState(false)
  const latestPreviewUrl = useRef<string | undefined>(undefined)
  /** Cada escolha leva o próprio número: o preparo de uma escolha antiga, mais lento, não sobrescreve a última. */
  const latestChoice = useRef(0)

  useEffect(
    () => () => {
      if (latestPreviewUrl.current !== undefined) URL.revokeObjectURL(latestPreviewUrl.current)
    },
    [],
  )

  function showPreview(photo: OccurrenceDraftPhoto): void {
    if (latestPreviewUrl.current !== undefined) URL.revokeObjectURL(latestPreviewUrl.current)
    latestPreviewUrl.current = URL.createObjectURL(photo.original)
    setPreviewUrl(latestPreviewUrl.current)
  }

  async function prepare(file: File): Promise<void> {
    latestChoice.current += 1
    const choice = latestChoice.current
    setFailure(undefined)
    if (!file.type.startsWith(CARGO_OCCURRENCE_IMAGE_MIME_PREFIX)) {
      setIsPreparing(false)
      setFailure('photoNotImage')
      return
    }
    setIsPreparing(true)
    try {
      const photo = { id: crypto.randomUUID(), ...(await prepareOccurrencePhoto(file)) }
      if (choice !== latestChoice.current) return
      showPreview(photo)
      onPrepared(photo)
    } catch {
      if (choice === latestChoice.current) setFailure('photoUnreadable')
    } finally {
      if (choice === latestChoice.current) setIsPreparing(false)
    }
  }

  return { failure, isPreparing, previewUrl, setFile: (file) => void prepare(file) }
}
