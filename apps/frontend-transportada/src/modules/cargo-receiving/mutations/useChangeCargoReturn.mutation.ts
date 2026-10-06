/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'

import { useRefreshCargoOccurrenceEffects } from '../hooks/useRefreshCargoOccurrenceEffects.hook'
import type { CargoReturnAction, CargoReturnResult } from '../shared/cargoOccurrence.types'
import { getCargoOccurrenceClient } from '../shared/cargoOccurrenceClient.service'

export type ChangeCargoReturnVariables = Readonly<{
  action: CargoReturnAction
  documentId: string
  note: string
  occurrenceId?: string | undefined
}>

/** Marcar, desfazer e concluir a devolução: o mesmo gesto com três verbos, sempre relendo o que depende dele. */
export function useChangeCargoReturnMutation(arrivalId: string) {
  const refresh = useRefreshCargoOccurrenceEffects(arrivalId)
  return useMutation<CargoReturnResult, Error, ChangeCargoReturnVariables>({
    mutationFn: (variables) => getCargoOccurrenceClient().changeReturn({ arrivalId, ...variables }),
    onSettled: refresh,
  })
}
