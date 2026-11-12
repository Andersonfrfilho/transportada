/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getDeliveryClientWhatsAppClient } from '../shared/deliveryClientWhatsAppClient.service'

export const DELIVERY_CLIENT_WHATSAPP_QUERY_KEY = 'delivery-client-whatsapp'

/**
 * Spec 281 T8b: a lista, a inclusão, a edição (rótulo e/ou número) e a remoção dos números de WhatsApp do cliente.
 * Gravar relê a lista, e as opções de envio da ocorrência (que leem o mesmo cadastro) também.
 */
export function useDeliveryClientWhatsApp(input: Readonly<{ taxId: string }>) {
  const queryClient = useQueryClient()
  const client = getDeliveryClientWhatsAppClient()

  function refresh(): void {
    void queryClient.invalidateQueries({
      queryKey: [DELIVERY_CLIENT_WHATSAPP_QUERY_KEY, input.taxId],
    })
    void queryClient.invalidateQueries({ queryKey: ['contractor-reply-whatsapp-options'] })
  }

  const listQuery = useQuery({
    queryFn: () => client.list(input.taxId),
    queryKey: [DELIVERY_CLIENT_WHATSAPP_QUERY_KEY, input.taxId],
  })
  const addMutation = useMutation({
    mutationFn: (body: { label: string; number: string }) =>
      client.add({ body, taxId: input.taxId }),
    onSuccess: refresh,
  })
  const updateMutation = useMutation({
    mutationFn: (variables: Readonly<{ label?: string; number?: string; numberId: string }>) =>
      client.update({
        body: {
          ...(variables.label === undefined ? {} : { label: variables.label }),
          ...(variables.number === undefined ? {} : { number: variables.number }),
        },
        numberId: variables.numberId,
        taxId: input.taxId,
      }),
    onSuccess: refresh,
  })
  const removeMutation = useMutation({
    mutationFn: (numberId: string) => client.remove({ numberId, taxId: input.taxId }),
    onSuccess: refresh,
  })
  return { addMutation, listQuery, removeMutation, updateMutation }
}
