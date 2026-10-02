/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import { createIndexedDbProofThumbnailStore } from '../shared/indexedDbQueue.service'
import { readProofThumbnail } from '../shared/proofThumbnailArchive.service'
import { useDriverSession } from './useDriverSession.hook'

const STORE = createIndexedDbProofThumbnailStore()

/**
 * A miniatura do canhoto que o servidor já tem, lida do aparelho (pedido do usuário, 01/10). Lê o
 * IndexedDB — sistema externo, então `useEffect` é o lugar certo — e devolve a URL `blob:`, liberada
 * ao sair da tela. Sem miniatura guardada (foto anexada pelo escritório, outro aparelho, prazo
 * vencido), devolve `undefined` e a tela fica só com a frase.
 */
export function useStoredProofThumbnail(input: {
  readonly documentId: string
  readonly enabled: boolean
}): string | undefined {
  const { documentId, enabled } = input
  const { subHash } = useDriverSession()
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!enabled) return undefined
    let url: string | undefined
    let isCurrent = true

    readProofThumbnail({ documentId, now: new Date(), store: STORE, subHash })
      .then((blob) => {
        if (blob === undefined) return
        if (!isCurrent) return
        url = URL.createObjectURL(blob)
        setPreviewUrl(url)
      })
      .catch(() => undefined)

    return () => {
      isCurrent = false
      if (url !== undefined) URL.revokeObjectURL(url)
      setPreviewUrl(undefined)
    }
  }, [documentId, enabled, subHash])

  return previewUrl
}
