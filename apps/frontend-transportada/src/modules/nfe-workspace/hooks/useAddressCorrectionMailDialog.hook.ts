/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  activeAddressCorrectionMailContacts,
  canConfirmAddressCorrectionMail,
  initialAddressCorrectionMailContactIds,
} from '../shared/addressCorrectionMail.service'
import type { AddressCorrectionMailSendResult } from '../shared/addressCorrectionMail.validation'
import { AddressCorrectionRequestError } from '../shared/addressCorrectionRequestError.service'
import { createNfeWorkspaceClient } from '../shared/nfeWorkspaceClient.service'
import { ADDRESS_CORRECTION_REQUESTS_QUERY_KEY } from '../shared/nfeWorkspace.constant'
import { ADDRESS_REPORT_QUERY_KEY } from './useAddressReport.hook'

export type AddressCorrectionMailPreviewItem = Readonly<{
  addressKey: string
  asIs: string
  proposed: string
}>

/** Sem `requestIds` é o envio completo da contratante; com a lista, é o unitário de um endereço só. */
export type AddressCorrectionMailTarget = Readonly<{
  contractorName: string
  contractorTaxId: string
  previewItems: readonly AddressCorrectionMailPreviewItem[]
  requestIds?: readonly string[]
}>

export type UseAddressCorrectionMailDialogResult = ReturnType<typeof useAddressCorrectionMailDialog>

const CONTRACTOR_QUERY_KEY = 'address-correction-mail-contractor'
const CONTACTS_QUERY_KEY = 'address-correction-mail-contacts'

function createClient() {
  return createNfeWorkspaceClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

function readErrorCode(error: unknown): null | string {
  return error instanceof Error ? error.message : null
}

/**
 * A confirmação do envio do pedido de correção (spec 150, T305): resolve o `contractorId` pelo
 * CNPJ, lista os contatos ativos, e envia com `Idempotency-Key` estável entre retries da mesma
 * confirmação — mesmo padrão de `attemptToken` de `useNfseInvoiceBulkCancel`.
 */
export function useAddressCorrectionMailDialog() {
  const queryClient = useQueryClient()
  const client = createClient()
  const [target, setTarget] = useState<AddressCorrectionMailTarget | null>(null)
  /** `null` até o operador tocar num checkbox: a seleção efetiva cai para a inicial até lá. */
  const [selectedContactIdsOverride, setSelectedContactIdsOverride] = useState<
    readonly string[] | null
  >(null)
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [result, setResult] = useState<AddressCorrectionMailSendResult | null>(null)

  const isOpen = target !== null

  const contractorQuery = useQuery({
    enabled: isOpen,
    queryFn: () => client.getAddressCorrectionContractor({ taxId: target?.contractorTaxId ?? '' }),
    queryKey: [CONTRACTOR_QUERY_KEY, target?.contractorTaxId],
  })

  const contractorId = contractorQuery.data?.id

  const contactsQuery = useQuery({
    enabled: isOpen && contractorId !== undefined,
    queryFn: () => client.listAddressCorrectionContacts({ contractorId: contractorId ?? '' }),
    queryKey: [CONTACTS_QUERY_KEY, contractorId],
  })

  const contacts = activeAddressCorrectionMailContacts(contactsQuery.data ?? [])
  const selectedContactIds =
    selectedContactIdsOverride ?? initialAddressCorrectionMailContactIds(contacts)

  const sendMutation = useMutation({
    mutationFn: () => {
      if (target === null) {
        throw new AddressCorrectionRequestError('NFE_WORKSPACE_RESPONSE_INVALID')
      }
      return client.sendAddressCorrectionMail({
        contactIds: selectedContactIds,
        contractorTaxId: target.contractorTaxId,
        idempotencyKey,
        ...(target.requestIds === undefined ? {} : { requestIds: target.requestIds }),
      })
    },
    onSuccess: (sent) => {
      setResult(sent)
      /**
       * As duas chaves são do próprio módulo (`nfe-workspace`): `invalidateMutationEffect` é o
       * registro de efeito **entre** módulos (`mutations.md`) — aqui a lista de pedidos e o
       * relatório são o mesmo módulo que a mutação, o mesmo padrão que `useAddressCorrectionForm`
       * (T201) já usa para o `PUT` do rascunho.
       */
      void queryClient.invalidateQueries({ queryKey: [ADDRESS_REPORT_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [ADDRESS_CORRECTION_REQUESTS_QUERY_KEY] })
    },
  })

  function open(next: AddressCorrectionMailTarget): void {
    setTarget(next)
    setSelectedContactIdsOverride(null)
    setIdempotencyKey(crypto.randomUUID())
    setResult(null)
    sendMutation.reset()
  }

  function close(): void {
    setTarget(null)
    setSelectedContactIdsOverride(null)
    setResult(null)
    sendMutation.reset()
  }

  function toggleContact(contactId: string): void {
    setSelectedContactIdsOverride(
      selectedContactIds.includes(contactId)
        ? selectedContactIds.filter((id) => id !== contactId)
        : [...selectedContactIds, contactId],
    )
  }

  function confirm(): void {
    if (!canConfirmAddressCorrectionMail(selectedContactIds.length)) return
    sendMutation.mutate()
  }

  return {
    close,
    confirm,
    contacts,
    contactsFailed: contactsQuery.isError,
    contactsLoading: isOpen && (contractorQuery.isFetching || contactsQuery.isFetching),
    contractorFailed: contractorQuery.isError,
    canConfirm: canConfirmAddressCorrectionMail(selectedContactIds.length),
    errorCode: readErrorCode(sendMutation.error ?? contractorQuery.error ?? contactsQuery.error),
    isOpen,
    isSending: sendMutation.isPending,
    open,
    result,
    selectedContactIds,
    target,
    toggleContact,
  }
}
