/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'

import { useRefreshCargoOccurrenceEffects } from '../hooks/useRefreshCargoOccurrenceEffects.hook'
import type { RegisterCargoOccurrenceResult } from '../shared/cargoOccurrence.types'
import { getCargoOccurrenceClient } from '../shared/cargoOccurrenceClient.service'

export type RegisterCargoOccurrenceVariables = Readonly<{
  documentId: string
  form: FormData
  idempotencyKey: string
}>

/** A avaria só é gravada no servidor: a tela espera a resposta — ela traz o 409 de reuso e o 422 da janela. */
export function useRegisterCargoOccurrenceMutation(arrivalId: string) {
  const refresh = useRefreshCargoOccurrenceEffects(arrivalId)
  return useMutation<RegisterCargoOccurrenceResult, Error, RegisterCargoOccurrenceVariables>({
    mutationFn: (variables) =>
      getCargoOccurrenceClient().registerOccurrence({ arrivalId, ...variables }),
    onSettled: refresh,
  })
}
