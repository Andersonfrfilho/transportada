/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getLocationRetentionClient } from '../shared/locationRetentionClient.provider'
import type {
  LocationRetentionDraft,
  LocationRetentionImpact,
  LocationRetentionSettings,
} from '../shared/locationRetention.validation'

const LOCATION_RETENTION_QUERY_KEY = ['trip', 'location-retention'] as const
const LOCATION_RETENTION_IMPACT_QUERY_KEY = ['trip', 'location-retention-impact'] as const

/** Spec 239: o `enabled` (aba aberta **e** `settings.manage`) é o que faz o painel vir preenchido. */
export function useLocationRetentionQuery(input: Readonly<{ enabled: boolean }>) {
  return useQuery<LocationRetentionSettings>({
    enabled: input.enabled,
    queryFn: () => getLocationRetentionClient().get(),
    queryKey: LOCATION_RETENTION_QUERY_KEY,
  })
}

/**
 * D5: a contagem é a de **agora**, só pedida ao abrir a confirmação. `gcTime` e `staleTime` zerados
 * para que reabrir o diálogo conte de novo em vez de mostrar o número de uma abertura anterior.
 */
export function useLocationRetentionImpactQuery(
  input: Readonly<{ enabled: boolean; retentionDays: number }>,
) {
  return useQuery<LocationRetentionImpact>({
    enabled: input.enabled,
    gcTime: 0,
    queryFn: () => getLocationRetentionClient().readImpact(input.retentionDays),
    queryKey: [...LOCATION_RETENTION_IMPACT_QUERY_KEY, input.retentionDays],
    staleTime: 0,
  })
}

export function useSaveLocationRetentionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: LocationRetentionDraft) => getLocationRetentionClient().save(draft),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LOCATION_RETENTION_QUERY_KEY })
    },
  })
}

export function useClearLocationRetentionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => getLocationRetentionClient().clear(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LOCATION_RETENTION_QUERY_KEY })
    },
  })
}
