/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation } from '@tanstack/react-query'

import { useRefreshCargoOccurrenceEffects } from '../hooks/useRefreshCargoOccurrenceEffects.hook'
import type { CargoCaseResult, ChangeCargoCaseInput } from '../shared/cargoOccurrenceCase.types'
import { getCargoOccurrenceCaseClient } from '../shared/cargoOccurrenceCaseClient.service'

/**
 * Uma ação da tratativa. Relê a chegada também quando FALHA: a recusa costuma ser porque a tratativa mudou em outra
 * tela, e a lista que a pessoa vê precisa mostrar o estado de agora (`onSettled`, nunca só `onSuccess`).
 */
export function useChangeCargoCaseMutation(arrivalId: string) {
  const refresh = useRefreshCargoOccurrenceEffects(arrivalId)
  return useMutation<CargoCaseResult, Error, ChangeCargoCaseInput>({
    mutationFn: (variables) => getCargoOccurrenceCaseClient().changeCase(variables),
    onSettled: refresh,
  })
}
