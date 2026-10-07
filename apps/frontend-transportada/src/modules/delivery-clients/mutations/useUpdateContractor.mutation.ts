/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { CONTRACTOR_DIRECTORY_QUERY_KEY } from '../queries/useContractorDirectory.query'
import { getContractorDirectoryClient } from '../shared/contractorDirectoryClient.service'
import type { ContractorWrite } from '../shared/contractorDirectory.types'

export function useUpdateContractorMutation(contractorId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (values: ContractorWrite) =>
      getContractorDirectoryClient().updateContractor({ id: contractorId, values }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CONTRACTOR_DIRECTORY_QUERY_KEY, 'list'] })
    },
  })
}
