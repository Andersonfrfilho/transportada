/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'

import { getCargoPreviewClient } from '../shared/cargoPreviewClient.service'

/** Propor não cria nada: devolve o rascunho. Quem registra a chegada é o `POST /cargo-arrivals` de sempre. */
export function useProposeCargoPreviewArrivalMutation(previewId: string) {
  return useMutation({
    mutationFn: () => getCargoPreviewClient().proposeArrival(previewId),
  })
}
