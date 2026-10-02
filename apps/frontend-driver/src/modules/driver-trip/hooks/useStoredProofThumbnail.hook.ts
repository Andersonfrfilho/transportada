/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { getDriverTripClient } from '../shared/driverTripClient.service'
import { createIndexedDbProofThumbnailStore } from '../shared/indexedDbQueue.service'
import { readProofThumbnail } from '../shared/proofThumbnailArchive.service'
import { useDriverSession } from './useDriverSession.hook'

const STORE = createIndexedDbProofThumbnailStore()

/**
 * Pedido do usuário (01/10): a foto do canhoto já enviado, na tela.
 *
 * Duas fontes, nesta ordem. **O aparelho primeiro**: a miniatura guardada no envio abre na hora,
 * funciona sem sinal e não gasta rede — é o caso de quase toda nota que o motorista acabou de
 * fechar. **O servidor depois**, só quando o aparelho não tem (foto anexada pelo escritório, celular
 * trocado, as 24 h vencidas): uma URL assinada de 5 min, pedida uma vez por nota.
 *
 * A leitura do IndexedDB é `useEffect` porque é sistema externo; a do servidor é TanStack Query,
 * como toda chamada desta app. Sem rede ou com a nota fora do alcance, fica `undefined` e a tela
 * mostra só a frase — nunca um quadro quebrado.
 */
export function useStoredProofThumbnail(input: {
  readonly documentId: string
  readonly enabled: boolean
}): string | undefined {
  const { documentId, enabled } = input
  const { canSync, subHash } = useDriverSession()
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined)
  /** `false` enquanto o IndexedDB não respondeu: a rede não corre na frente do que já está aqui. */
  const [isDeviceEmpty, setIsDeviceEmpty] = useState(false)

  useEffect(() => {
    if (!enabled) return undefined
    let url: string | undefined
    let isCurrent = true

    readProofThumbnail({ documentId, now: new Date(), store: STORE, subHash })
      .then((blob) => {
        if (!isCurrent) return
        if (blob === undefined) {
          setIsDeviceEmpty(true)
          return
        }
        url = URL.createObjectURL(blob)
        setPreviewUrl(url)
      })
      .catch(() => {
        if (isCurrent) setIsDeviceEmpty(true)
      })

    return () => {
      isCurrent = false
      if (url !== undefined) URL.revokeObjectURL(url)
      setPreviewUrl(undefined)
      setIsDeviceEmpty(false)
    }
  }, [documentId, enabled, subHash])

  const remote = useQuery({
    enabled: enabled && canSync && isDeviceEmpty,
    queryFn: () => getDriverTripClient().readDeliveryProofs(documentId),
    queryKey: ['driver-trip', 'delivery-proofs', documentId],
    /** A URL assinada vive 5 min; relê-la a cada montagem gastaria rede sem mudar a tela. */
    staleTime: 4 * 60 * 1000,
  })

  if (previewUrl !== undefined) return previewUrl

  const photo = remote.data?.find((proof) => proof.kind === 'photo')
  return photo === undefined ? undefined : (photo.thumbnailUrl ?? photo.downloadUrl)
}
