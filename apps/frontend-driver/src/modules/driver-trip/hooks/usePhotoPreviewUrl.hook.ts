/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

export type PhotoPreview = Readonly<{
  previewUrl: string | undefined
  showPhoto: (blob: Blob) => void
}>

/**
 * A miniatura da foto que acabou de ser anexada. A URL `blob:` é recurso do navegador: a anterior
 * é liberada ao trocar de foto, e a última, quando o formulário sai da tela.
 *
 * Spec 218: `initialBlob` é o arquivo que a fila já guarda — a miniatura nasce dele, sem esperar
 * uma captura nova.
 */
export function usePhotoPreviewUrl(initialBlob?: Blob): PhotoPreview {
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(() =>
    initialBlob === undefined ? undefined : URL.createObjectURL(initialBlob),
  )
  const currentUrlRef = useRef<string | undefined>(previewUrl)

  useEffect(
    () => () => {
      if (currentUrlRef.current !== undefined) URL.revokeObjectURL(currentUrlRef.current)
    },
    [],
  )

  function showPhoto(blob: Blob): void {
    if (currentUrlRef.current !== undefined) URL.revokeObjectURL(currentUrlRef.current)
    const url = URL.createObjectURL(blob)
    currentUrlRef.current = url
    setPreviewUrl(url)
  }

  return { previewUrl, showPhoto }
}
