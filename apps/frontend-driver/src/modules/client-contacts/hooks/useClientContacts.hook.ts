/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { DriverConversationRequestError } from '@/modules/conversation/shared/driverConversationsHttp.service'

import type { ClientContact, ClientContactChannel } from '../shared/clientContacts.types'
import { getClientContactsApi } from '../shared/clientContactsInstance.service'

export const clientContactsQueryKey = (documentId: string) =>
  ['client-contacts', documentId] as const

export type ClientContactsErrorKey = 'duplicate' | 'failed' | 'invalid' | 'limit' | 'notFound'

/** O código da API vira a frase da tela; o que não se conhece é falha genérica ("toque para tentar de novo"). */
export function toClientContactsErrorKey(cause: unknown): ClientContactsErrorKey {
  if (!(cause instanceof DriverConversationRequestError)) return 'failed'
  switch (cause.status) {
    case 400:
      return 'invalid'
    case 404:
      return 'notFound'
    case 409:
      return 'duplicate'
    case 422:
      return 'limit'
    default:
      return 'failed'
  }
}

export type ClientContactsState = Readonly<{
  add: (input: {
    readonly address: string
    readonly channel: ClientContactChannel
    readonly label: string
  }) => Promise<boolean>
  contacts: readonly ClientContact[]
  errorKey: ClientContactsErrorKey | undefined
  isBusy: boolean
  isLoading: boolean
  /** Sem sinal ou a API caiu: a seção avisa e o registro da ocorrência segue sem ela. */
  isUnavailable: boolean
  remove: (contactId: string) => Promise<boolean>
  update: (input: {
    readonly address?: string
    readonly contactId: string
    readonly label?: string
  }) => Promise<boolean>
}>

/**
 * Spec 281 T8b (D13): os contatos do cliente da nota na abertura da ocorrência. Escrever é online: o motorista
 * confere o contato na tela e a API devolve o resultado na hora — não há fila, porque o contato não pode sair sem
 * conferência. Cada gravação invalida a lista.
 */
export function useClientContacts(input: {
  readonly documentId: string
  readonly isEnabled: boolean
}): ClientContactsState {
  const queryClient = useQueryClient()
  const [errorKey, setErrorKey] = useState<ClientContactsErrorKey | undefined>(undefined)
  const query = useQuery({
    enabled: input.isEnabled,
    queryFn: () => getClientContactsApi().list(input.documentId),
    queryKey: clientContactsQueryKey(input.documentId),
    retry: false,
    staleTime: 30_000,
  })
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: clientContactsQueryKey(input.documentId) })

  const add = useMutation({
    mutationFn: (value: Parameters<ClientContactsState['add']>[0]) =>
      getClientContactsApi().add({ ...value, documentId: input.documentId }),
  })
  const update = useMutation({
    mutationFn: (value: Parameters<ClientContactsState['update']>[0]) =>
      getClientContactsApi().update({ ...value, documentId: input.documentId }),
  })
  const remove = useMutation({
    mutationFn: (contactId: string) =>
      getClientContactsApi().remove({ contactId, documentId: input.documentId }),
  })

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setErrorKey(undefined)
    try {
      await action()
      await refresh()
      return true
    } catch (cause) {
      setErrorKey(toClientContactsErrorKey(cause))
      return false
    }
  }

  return {
    add: (value) => run(() => add.mutateAsync(value)),
    contacts: query.data ?? [],
    errorKey,
    isBusy: add.isPending || update.isPending || remove.isPending,
    isLoading: query.isLoading,
    isUnavailable: query.isError,
    remove: (contactId) => run(() => remove.mutateAsync(contactId)),
    update: (value) => run(() => update.mutateAsync(value)),
  }
}
