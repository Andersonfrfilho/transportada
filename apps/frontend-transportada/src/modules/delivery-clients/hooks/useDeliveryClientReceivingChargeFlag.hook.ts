/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getDeliveryClientReceivingChargeFlagClient } from '../shared/deliveryClientReceivingChargeFlag.service'

export const DELIVERY_CLIENT_RECEIVING_CHARGE_FLAG_QUERY_KEY =
  'delivery-client-receiving-charge-flag'

/** Spec 317 (T10): ler a marca do cliente e limpá-la (`fleet.manage`); limpar relê a marca. */
export function useDeliveryClientReceivingChargeFlag(
  input: Readonly<{ deliveryClientId: string }>,
) {
  const queryClient = useQueryClient()
  const client = getDeliveryClientReceivingChargeFlagClient()
  const queryKey = [DELIVERY_CLIENT_RECEIVING_CHARGE_FLAG_QUERY_KEY, input.deliveryClientId]

  const flagQuery = useQuery({
    queryFn: () => client.read(input.deliveryClientId),
    queryKey,
  })
  const clearMutation = useMutation({
    mutationFn: () => client.clear(input.deliveryClientId),
    onSuccess: (flag) => {
      queryClient.setQueryData(queryKey, flag)
    },
  })
  return { clearMutation, flagQuery }
}
