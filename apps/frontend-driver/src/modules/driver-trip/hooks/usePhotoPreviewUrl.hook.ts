/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'

export type PhotoPreview = Readonly<{
  previewUrl: string | undefined
  showPhoto: (blob: Blob) => void
}>

/**
 * A miniatura da foto que acabou de ser anexada. A URL `blob:` é recurso do navegador: a anterior
 * é liberada ao trocar de foto, e a última, quando o formulário sai da tela.
 */
export function usePhotoPreviewUrl(): PhotoPreview {
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined)
  const currentUrlRef = useRef<string | undefined>(undefined)

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
