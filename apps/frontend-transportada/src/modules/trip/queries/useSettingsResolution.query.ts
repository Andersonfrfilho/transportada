/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type { SettingsResolutionView } from '../shared/settingsResolution.service'

/**
 * Spec 218 RF-E1/T14: só liga quando o operador já escolheu contratante e/ou destinatário — sem
 * escolha nenhuma a tela mostra a configuração geral, sem consulta (P6 do spec.md).
 */
export function useSettingsResolutionQuery(
  input: Readonly<{ contractorId: null | string; recipientTaxId: null | string }>,
) {
  return useQuery<SettingsResolutionView>({
    enabled: input.contractorId !== null || input.recipientTaxId !== null,
    queryFn: () =>
      getTripClient().readSettingsResolution({
        contractorId: input.contractorId,
        recipientTaxId: input.recipientTaxId,
      }),
    queryKey: ['trip', 'settings-resolution', input.contractorId, input.recipientTaxId] as const,
  })
}
