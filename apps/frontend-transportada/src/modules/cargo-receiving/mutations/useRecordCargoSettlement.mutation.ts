/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { cargoSettlementQueryKey } from '../queries/useCargoSettlement.query'
import type { CargoSettlementItem, CargoSettlementView } from '../shared/cargoOccurrenceCase.types'
import { getCargoOccurrenceCaseClient } from '../shared/cargoOccurrenceCaseClient.service'

type RecordCargoSettlementVariables = Readonly<{
  items: readonly CargoSettlementItem[]
  occurrenceId: string
}>

/** O `PUT` substitui a lista inteira: ao terminar (certo ou errado), a leitura do acerto é refeita. */
export function useRecordCargoSettlementMutation() {
  const queryClient = useQueryClient()
  return useMutation<CargoSettlementView, Error, RecordCargoSettlementVariables>({
    mutationFn: (variables) => getCargoOccurrenceCaseClient().recordSettlement(variables),
    onSettled: (_result, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: cargoSettlementQueryKey(variables.occurrenceId),
      })
    },
  })
}
