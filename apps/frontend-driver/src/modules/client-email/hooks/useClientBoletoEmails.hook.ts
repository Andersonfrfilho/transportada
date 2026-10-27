/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { DriverConversationRequestError } from '@/modules/conversation/shared/driverConversationsHttp.service'

import type { ClientBoletoEmailOptions } from '../shared/clientBoletoEmail.types'
import { getClientBoletoEmailRuntime } from '../shared/clientBoletoEmailInstance.service'
import { isButtonHiddenByServer } from '../shared/clientBoletoEmailVisibility.service'

export const clientBoletoEmailsQueryKey = (occurrenceId: string) =>
  ['client-boleto-emails', occurrenceId] as const

export type ClientBoletoEmailsState = Readonly<{
  /** `true` quando a API disse que o tipo (ou o encaminhamento) não oferece o envio: o botão some. */
  isHidden: boolean
  isLoading: boolean
  options: ClientBoletoEmailOptions | undefined
  refetch: () => void
}>

/**
 * Spec 279 T6: lê os e-mails do cliente (mascarados). Sem sinal ou com erro de rede o botão continua — o motorista
 * ainda pode digitar um e-mail e enfileirar; só a recusa explícita da API (`409` tipo `off`, `404`) o esconde.
 */
export function useClientBoletoEmails(input: {
  readonly isEnabled: boolean
  readonly occurrenceId: string
}): ClientBoletoEmailsState {
  const query = useQuery({
    enabled: input.isEnabled,
    queryFn: () => getClientBoletoEmailRuntime().api.list(input.occurrenceId),
    queryKey: clientBoletoEmailsQueryKey(input.occurrenceId),
    retry: false,
    staleTime: 60_000,
  })
  const error = query.error
  const isHidden =
    error instanceof DriverConversationRequestError && isButtonHiddenByServer(error.status)
  return {
    isHidden,
    isLoading: query.isLoading,
    options: query.data,
    refetch: () => void query.refetch(),
  }
}
