/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type {
  DeliveryProofFieldSettings,
  DeliveryProofSettingsOverride,
} from '../shared/deliveryProofSettings.service'

const DELIVERY_PROOF_SETTINGS_QUERY_KEY = ['trip', 'delivery-proof-settings'] as const
const DELIVERY_PROOF_OVERRIDES_QUERY_KEY = ['trip', 'delivery-proof-overrides'] as const

/**
 * Spec 082: é o `enabled` que faz o painel **vir preenchido** — abrir a aba busca o que já está
 * gravado (ou a fábrica que a API resolve), em vez de mostrar formulário em branco por cima de
 * cadastro existente.
 */
export function useDeliveryProofSettingsQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<DeliveryProofFieldSettings>({
    enabled: input.enabled,
    queryFn: () => getTripClient().readDeliveryProofSettings(),
    queryKey: DELIVERY_PROOF_SETTINGS_QUERY_KEY,
  })
}

export function useDeliveryProofOverridesQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<readonly DeliveryProofSettingsOverride[]>({
    enabled: input.enabled,
    queryFn: () => getTripClient().listDeliveryProofOverrides(),
    queryKey: DELIVERY_PROOF_OVERRIDES_QUERY_KEY,
  })
}

export function useSaveDeliveryProofSettingsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: DeliveryProofFieldSettings) =>
      getTripClient().saveDeliveryProofSettings(settings),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DELIVERY_PROOF_SETTINGS_QUERY_KEY })
    },
  })
}

/** O `PUT` grava o conjunto inteiro de exceções — adicionar e remover passam pelo mesmo caminho. */
export function useReplaceDeliveryProofOverridesMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (overrides: readonly DeliveryProofSettingsOverride[]) =>
      getTripClient().replaceDeliveryProofOverrides({ overrides }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: DELIVERY_PROOF_OVERRIDES_QUERY_KEY })
    },
  })
}
