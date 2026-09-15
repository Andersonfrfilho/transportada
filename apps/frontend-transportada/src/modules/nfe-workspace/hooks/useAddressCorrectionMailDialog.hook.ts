/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  activeAddressCorrectionMailContacts,
  canConfirmAddressCorrectionMail,
  initialAddressCorrectionMailContactIds,
  resolveAddressCorrectionMailIdempotencyKey,
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

const RECIPIENTS_QUERY_KEY = 'address-correction-mail-recipients'

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
  /** `null` marca "sem tentativa em andamento" — força uma chave nova na próxima renderização. */
  const [contactSelectionSnapshot, setContactSelectionSnapshot] = useState<
    readonly string[] | null
  >(null)
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const [result, setResult] = useState<AddressCorrectionMailSendResult | null>(null)

  const isOpen = target !== null

  const recipientsQuery = useQuery({
    enabled: isOpen,
    queryFn: () =>
      client.findAddressCorrectionRecipients({
        contractorTaxId: target?.contractorTaxId ?? '',
      }),
    queryKey: [RECIPIENTS_QUERY_KEY, target?.contractorTaxId],
  })

  const contacts = activeAddressCorrectionMailContacts(recipientsQuery.data?.contacts ?? [])
  const selectedContactIds =
    selectedContactIdsOverride ?? initialAddressCorrectionMailContactIds(contacts)

  /**
   * Ajusta o estado durante a renderização (padrão oficial do React para "resetar estado quando
   * outro valor muda", sem `useEffect`): a chave só muda quando a seleção muda de fato —
   * `resolveAddressCorrectionMailIdempotencyKey` decide, `contactSelectionSnapshot === null`
   * (`open()`) força a troca mesmo que a seleção calculada seja igual à da sessão anterior.
   */
  const resolvedIdempotency = resolveAddressCorrectionMailIdempotencyKey({
    currentContactIds: selectedContactIds,
    generateKey: () => crypto.randomUUID(),
    previousContactIds: contactSelectionSnapshot,
    previousIdempotencyKey: idempotencyKey,
  })
  if (resolvedIdempotency.idempotencyKey !== idempotencyKey) {
    setContactSelectionSnapshot(resolvedIdempotency.contactIds)
    setIdempotencyKey(resolvedIdempotency.idempotencyKey)
  }

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
    setContactSelectionSnapshot(null)
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
    canConfirm: canConfirmAddressCorrectionMail(selectedContactIds.length),
    errorCode: readErrorCode(sendMutation.error ?? recipientsQuery.error),
    isOpen,
    isSending: sendMutation.isPending,
    open,
    recipientsFailed: recipientsQuery.isError,
    recipientsLoading: isOpen && recipientsQuery.isFetching,
    result,
    selectedContactIds,
    target,
    toggleContact,
  }
}
