/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getDeliveryClientEmailsClient } from '../shared/deliveryClientEmailsClient.service'
import type { DeliveryClientEmailCreateBody } from '../shared/deliveryClientEmails.types'

export const DELIVERY_CLIENT_EMAILS_QUERY_KEY = 'delivery-client-emails'

/**
 * Spec 279 RF5 (T5): a lista, a inclusão, a troca de rótulo e a remoção dos e-mails do cliente. Gravar relê a
 * lista, e as opções de envio da ocorrência (que leem o mesmo cadastro) também.
 */
export function useDeliveryClientEmails(input: Readonly<{ enabled: boolean; taxId: string }>) {
  const queryClient = useQueryClient()
  const client = getDeliveryClientEmailsClient()

  function refresh(): void {
    void queryClient.invalidateQueries({
      queryKey: [DELIVERY_CLIENT_EMAILS_QUERY_KEY, input.taxId],
    })
    void queryClient.invalidateQueries({ queryKey: ['contractor-reply-email-options'] })
  }

  const listQuery = useQuery({
    enabled: input.enabled,
    queryFn: () => client.listEmails(input.taxId),
    queryKey: [DELIVERY_CLIENT_EMAILS_QUERY_KEY, input.taxId],
  })
  const addMutation = useMutation({
    mutationFn: (body: DeliveryClientEmailCreateBody) =>
      client.addEmail({ body, taxId: input.taxId }),
    onSuccess: refresh,
  })
  const labelMutation = useMutation({
    mutationFn: (variables: Readonly<{ emailId: string; label: string }>) =>
      client.updateLabel({ ...variables, taxId: input.taxId }),
    onSuccess: refresh,
  })
  const removeMutation = useMutation({
    mutationFn: (emailId: string) => client.removeEmail({ emailId, taxId: input.taxId }),
    onSuccess: refresh,
  })
  return { addMutation, labelMutation, listQuery, removeMutation }
}
