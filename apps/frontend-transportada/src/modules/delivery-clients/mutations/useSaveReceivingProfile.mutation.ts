/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { receivingProfileQueryKey } from '../queries/useReceivingProfile.query'
import { getContractorDirectoryClient } from '../shared/contractorDirectoryClient.service'
import type { ReceivingProfileRules } from '../shared/receivingProfile.types'

export function useSaveReceivingProfileMutation(contractorId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (rules: ReceivingProfileRules) =>
      getContractorDirectoryClient().saveReceivingProfile({ contractorId, rules }),
    /** O `PUT` devolve o perfil gravado: ele entra no cache sem uma segunda ida, e o selo da lista acompanha. */
    onSuccess: (profile) => {
      queryClient.setQueryData(receivingProfileQueryKey(contractorId), profile)
    },
  })
}
