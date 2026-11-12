/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '../shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '../shared/KeycloakAuthProvider.provider'
import {
  createCompanyUserWhatsAppPhoneClient,
  type CompanyUserWhatsAppPhoneClient,
} from '../shared/whatsappPhoneClient.service'

export const COMPANY_USER_WHATSAPP_PHONE_QUERY_KEY = ['identity', 'company-user-whatsapp-phone']

export function getCompanyUserWhatsAppPhoneClient(): CompanyUserWhatsAppPhoneClient {
  return createCompanyUserWhatsAppPhoneClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/** O estado vem sempre do `GET` da API; gravar e desfazer só o invalidam, nunca o deduzem. */
export function useCompanyUserWhatsAppPhone(
  input: Readonly<{ client?: CompanyUserWhatsAppPhoneClient; userId: string }>,
) {
  const client = input.client ?? getCompanyUserWhatsAppPhoneClient()
  const queryClient = useQueryClient()
  const queryKey = [...COMPANY_USER_WHATSAPP_PHONE_QUERY_KEY, input.userId]
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey })
  }

  const query = useQuery({ queryFn: () => client.readState(input.userId), queryKey })
  const bindMutation = useMutation({
    mutationFn: (phone: string) => client.bind({ phone, userId: input.userId }),
    onSuccess: invalidate,
  })
  const unbindMutation = useMutation({
    mutationFn: () => client.unbind(input.userId),
    onSuccess: invalidate,
  })

  return { bindMutation, query, unbindMutation }
}
