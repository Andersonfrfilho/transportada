/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { getTripClient } from '../hooks/useTripWorkspace.hook'
import type { FieldDeliverySettings } from '../shared/deliveryProofSettings.service'

const FIELD_DELIVERY_SETTINGS_QUERY_KEY = ['trip', 'field-delivery-settings'] as const

/**
 * Spec 156 T13, ADR-0069 §6: o assistente de baixa do escritório pergunta se a leitura do número do
 * canhoto está ligada. `enabled` fica com quem chama — só quem tem `trip.report-on-behalf` abre o
 * assistente, e a rota responde 403 para os demais.
 */
export function useFieldDeliverySettingsQuery(
  input: Readonly<{ enabled: boolean }>,
): UseQueryResult<FieldDeliverySettings> {
  return useQuery<FieldDeliverySettings>({
    enabled: input.enabled,
    queryFn: () => getTripClient().readFieldDeliverySettings(),
    queryKey: FIELD_DELIVERY_SETTINGS_QUERY_KEY,
  })
}
