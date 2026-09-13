/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '../shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '../shared/KeycloakAuthProvider.provider'
import {
  createWhatsAppPhoneClient,
  type WhatsAppPhoneClient,
} from '../shared/whatsappPhoneClient.service'
import {
  buildWhatsAppCodeExpiryHandler,
  resolveWhatsAppPhoneRefetchInterval,
} from '../shared/whatsappPhoneViewModel.service'

export const WHATSAPP_PHONE_QUERY_KEY = ['identity', 'whatsapp-phone'] as const

export function getWhatsAppPhoneClient(): WhatsAppPhoneClient {
  return createWhatsAppPhoneClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * Um hook só para as duas telas (painel e perfil do motorista): a leitura do vínculo, pedir código e
 * desvincular. O estado (`none | pending | verified | expired`) vem sempre do `GET` — nunca deduzido
 * aqui —, e o código gerado vive só no resultado da mutação, nunca no cache da consulta.
 */
export function useWhatsAppPhone(input: Readonly<{ client?: WhatsAppPhoneClient }> = {}) {
  const client = input.client ?? getWhatsAppPhoneClient()
  const queryClient = useQueryClient()

  const requestMutation = useMutation({
    mutationFn: (phone: string) => client.requestVerification({ phone }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WHATSAPP_PHONE_QUERY_KEY })
    },
  })

  // T020 (B6): a verificação acontece no WhatsApp; só relendo o `GET` a tela percebe.
  const query = useQuery({
    queryFn: client.readState,
    queryKey: WHATSAPP_PHONE_QUERY_KEY,
    refetchInterval: (current) =>
      resolveWhatsAppPhoneRefetchInterval({
        hasGeneratedCode: requestMutation.data !== undefined,
        status: current.state.data?.status,
      }),
  })

  const unbindMutation = useMutation({
    mutationFn: () => client.unbind(),
    onSuccess: () => {
      requestMutation.reset()
      void queryClient.invalidateQueries({ queryKey: WHATSAPP_PHONE_QUERY_KEY })
    },
  })

  const expireCode = buildWhatsAppCodeExpiryHandler({
    invalidate: () => {
      void queryClient.invalidateQueries({ queryKey: WHATSAPP_PHONE_QUERY_KEY })
    },
    reset: () => requestMutation.reset(),
  })

  return { expireCode, query, requestMutation, unbindMutation }
}
