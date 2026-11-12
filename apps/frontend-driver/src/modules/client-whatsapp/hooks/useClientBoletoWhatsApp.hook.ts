/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { isButtonHiddenByServer } from '@/modules/client-email/shared/clientBoletoEmailVisibility.service'
import { DriverConversationRequestError } from '@/modules/conversation/shared/driverConversationsHttp.service'

import type { ClientBoletoWhatsAppOptions } from '../shared/clientBoletoWhatsApp.types'
import { getClientBoletoWhatsAppRuntime } from '../shared/clientBoletoWhatsAppInstance.service'

export const clientBoletoWhatsAppQueryKey = (occurrenceId: string) =>
  ['client-boleto-whatsapp', occurrenceId] as const

export type ClientBoletoWhatsAppState = Readonly<{
  /**
   * `true` quando a API disse que o tipo não oferece o WhatsApp (`409`, `404`) ou quando o número da empresa não
   * está conectado (RF5): o botão some e o "Enviar ao cliente" por e-mail segue sozinho.
   */
  isHidden: boolean
  isLoading: boolean
  options: ClientBoletoWhatsAppOptions | undefined
}>

/**
 * Spec 281 T8: lê os números do cliente (mascarados) e o estado do que já saiu. Sem sinal ou com erro de rede o
 * botão continua — o motorista ainda pode digitar o número e enfileirar.
 */
export function useClientBoletoWhatsApp(input: {
  readonly isEnabled: boolean
  readonly occurrenceId: string
}): ClientBoletoWhatsAppState {
  const query = useQuery({
    enabled: input.isEnabled,
    queryFn: () => getClientBoletoWhatsAppRuntime().api.list(input.occurrenceId),
    queryKey: clientBoletoWhatsAppQueryKey(input.occurrenceId),
    retry: false,
    staleTime: 60_000,
  })
  const error = query.error
  const isHiddenByServer =
    error instanceof DriverConversationRequestError && isButtonHiddenByServer(error.status)
  return {
    isHidden: isHiddenByServer || query.data?.evolutionReady === false,
    isLoading: query.isLoading,
    options: query.data,
  }
}
