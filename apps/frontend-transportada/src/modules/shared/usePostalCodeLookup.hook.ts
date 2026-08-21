/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { isCompletePostalCode } from './postalCode.service'
import type { PostalCodeClient, PostalCodeSuggestion } from './postalCodeClient.service'
import { createPostalCodeClient } from './postalCodeClient.service'
import { useGuardedRequest } from './useGuardedRequest.hook'

export const POSTAL_CODE_LOOKUP_STATUS = {
  found: 'found',
  idle: 'idle',
  missing: 'missing',
  pending: 'pending',
} as const
export type PostalCodeLookupStatus =
  (typeof POSTAL_CODE_LOOKUP_STATUS)[keyof typeof POSTAL_CODE_LOOKUP_STATUS]

const POSTAL_CODE_FIELD_KEYS = ['city', 'district', 'state', 'street'] as const

/**
 * O nome que cada formulário dá aos campos que o CEP sabe preencher. Nenhum é obrigatório: a lotação
 * do MDF-e só tem a UF de destino, e o CEP de carregamento não tem onde escrever — consultar ainda
 * vale, porque o status diz se o CEP existe.
 */
export type PostalCodeFieldNames<TState> = Readonly<{
  city?: keyof TState & string
  district?: keyof TState & string
  state?: keyof TState & string
  street?: keyof TState & string
}>

export type PostalCodeLookupController = Readonly<{
  lookup: (value: string) => void
  reset: () => void
  status: PostalCodeLookupStatus
}>

type UsePostalCodeLookupInput<TState> = Readonly<{
  client?: PostalCodeClient
  fields: PostalCodeFieldNames<TState>
  patch: (values: Partial<TState>) => void
}>

type ToPostalCodeFieldPatchInput<TState> = Readonly<{
  fields: PostalCodeFieldNames<TState>
  suggestion: PostalCodeSuggestion
}>

/** Campo que ninguém soube preencher fica como está: sugestão parcial não apaga o digitado. */
export function toPostalCodeFieldPatch<TState>(
  input: ToPostalCodeFieldPatchInput<TState>,
): Partial<TState> {
  const filled: Record<string, string> = {}
  for (const key of POSTAL_CODE_FIELD_KEYS) {
    const target = input.fields[key]
    const value = input.suggestion[key]
    if (target !== undefined && value !== '') {
      filled[target] = value
    }
  }

  return filled as Partial<TState>
}

function buildPostalCodeClient(): PostalCodeClient {
  return createPostalCodeClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * Os três formulários que têm CEP consultam pelo mesmo caminho, e `missing` é o único desfecho de
 * quem não achou: rota fora do ar e CEP inexistente pedem a mesma coisa de quem está na tela, que é
 * digitar o endereço. Nada aqui desabilita, limpa ou tranca o envio.
 */
export function usePostalCodeLookup<TState>(
  input: UsePostalCodeLookupInput<TState>,
): PostalCodeLookupController {
  const { fields, patch } = input
  const injectedClient = input.client
  const client = useMemo(() => injectedClient ?? buildPostalCodeClient(), [injectedClient])
  const [status, setStatus] = useState<PostalCodeLookupStatus>(POSTAL_CODE_LOOKUP_STATUS.idle)
  const run = useGuardedRequest()

  function lookup(value: string): void {
    if (!isCompletePostalCode(value)) {
      setStatus(POSTAL_CODE_LOOKUP_STATUS.idle)
      return
    }
    setStatus(POSTAL_CODE_LOOKUP_STATUS.pending)
    run(
      (signal) => client.lookup({ postalCode: value, signal }),
      (suggestion) => {
        if (suggestion === null) {
          setStatus(POSTAL_CODE_LOOKUP_STATUS.missing)
          return
        }
        patch(toPostalCodeFieldPatch({ fields, suggestion }))
        setStatus(POSTAL_CODE_LOOKUP_STATUS.found)
      },
    )
  }

  function reset(): void {
    setStatus(POSTAL_CODE_LOOKUP_STATUS.idle)
  }

  return { lookup, reset, status }
}
