/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

export type PhotoPreview = Readonly<{
  previewUrl: string | undefined
  showPhoto: (blob: Blob) => void
}>

/**
 * A miniatura da foto que acabou de ser anexada. A URL `blob:` é recurso do navegador: cada ciclo do
 * efeito cria a sua e a libera ao trocar de foto ou ao sair da tela.
 *
 * Criar a URL dentro do efeito (e não ao iniciar o estado) é o que sobrevive ao desmonte e à
 * remontagem do `StrictMode`: uma URL criada na inicialização era liberada pelo primeiro cleanup e a
 * imagem ficava quebrada até a tela remontar.
 *
 * Spec 218: `initialBlob` é o arquivo que a fila já guarda — a miniatura nasce dele, sem esperar
 * uma captura nova.
 */
export function usePhotoPreviewUrl(initialBlob?: Blob): PhotoPreview {
  const [blob, setBlob] = useState<Blob | undefined>(initialBlob)
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (blob === undefined) {
      setPreviewUrl(undefined)
      return undefined
    }
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  return { previewUrl, showPhoto: setBlob }
}
