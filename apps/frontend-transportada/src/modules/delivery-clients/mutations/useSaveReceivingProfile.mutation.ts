/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { RECEIVING_PROFILES_QUERY_KEY } from '@/modules/shared/receivingProfileQueryKey.constant'

import { receivingProfileQueryKey } from '../queries/useReceivingProfile.query'
import { getContractorDirectoryClient } from '../shared/contractorDirectoryClient.service'
import type { ReceivingProfileRules } from '../shared/receivingProfile.types'

export function useSaveReceivingProfileMutation(contractorId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (rules: ReceivingProfileRules) =>
      getContractorDirectoryClient().saveReceivingProfile({ contractorId, rules }),
    /**
     * O `PUT` devolve o perfil gravado: ele entra no cache da ficha sem uma segunda ida. As listas de
     * perfis (o selo da aba e o filtro de quem recebe no recebimento da carga) vivem sob uma raiz
     * compartilhada e são relidas — nenhum módulo conhece o cache do outro.
     */
    onSuccess: (profile) => {
      queryClient.setQueryData(receivingProfileQueryKey(contractorId), profile)
      void queryClient.invalidateQueries({ queryKey: [RECEIVING_PROFILES_QUERY_KEY] })
    },
  })
}
