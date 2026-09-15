/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  activeAddressCorrectionMailContacts,
  activeAddressCorrectionMailTemplates,
  addressCorrectionMailTemplateIdForRequest,
  canConfirmAddressCorrectionMail,
  defaultAddressCorrectionMailTemplateId,
  initialAddressCorrectionMailContactIds,
  initialAddressCorrectionMailTemplateId,
  resolveAddressCorrectionMailIdempotencyKey,
} from '../shared/addressCorrectionMail.service'
import type {
  AddressCorrectionMailSendResult,
  AddressCorrectionMailTemplatePreview,
} from '../shared/addressCorrectionMail.validation'
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
const TEMPLATES_QUERY_KEY = 'address-correction-mail-templates'
const TEMPLATE_PREVIEW_QUERY_KEY = 'address-correction-mail-template-preview'

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
  /** `null` até o operador trocar de modelo no seletor: a seleção efetiva cai para a inicial. */
  const [selectedTemplateIdOverride, setSelectedTemplateIdOverride] = useState<string | null>(null)
  const [templateSelectionSnapshot, setTemplateSelectionSnapshot] = useState<string | null>(null)
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

  const templatesQuery = useQuery({
    enabled: isOpen,
    queryFn: () => client.listAddressCorrectionMailTemplates(),
    queryKey: [TEMPLATES_QUERY_KEY],
  })

  const contacts = activeAddressCorrectionMailContacts(recipientsQuery.data?.contacts ?? [])
  const selectedContactIds =
    selectedContactIdsOverride ?? initialAddressCorrectionMailContactIds(contacts)

  const templates = activeAddressCorrectionMailTemplates(templatesQuery.data ?? [])
  const defaultTemplateId = defaultAddressCorrectionMailTemplateId(templates)
  const selectedTemplateId =
    selectedTemplateIdOverride ?? initialAddressCorrectionMailTemplateId(templates)
  const templateIdForRequest = addressCorrectionMailTemplateIdForRequest({
    defaultTemplateId,
    selectedTemplateId,
  })

  const previewQuery = useQuery<AddressCorrectionMailTemplatePreview>({
    enabled: isOpen && selectedTemplateId !== null,
    queryFn: () =>
      client.previewAddressCorrectionMailTemplate({ templateId: selectedTemplateId ?? '' }),
    queryKey: [TEMPLATE_PREVIEW_QUERY_KEY, selectedTemplateId],
  })

  /**
   * Ajusta o estado durante a renderização (padrão oficial do React para "resetar estado quando
   * outro valor muda", sem `useEffect`): a chave só muda quando a seleção de contatos ou de modelo
   * muda de fato — `resolveAddressCorrectionMailIdempotencyKey` decide, `contactSelectionSnapshot
   * === null` (`open()`) força a troca mesmo que as duas seleções calculadas batam com a sessão
   * anterior. `currentTemplateId` é o valor **efetivo** que vai no corpo (`templateIdForRequest`,
   * `undefined` quando é o padrão) — trocar de modelo sem sair do padrão não conta como mudança.
   */
  const resolvedIdempotency = resolveAddressCorrectionMailIdempotencyKey({
    currentContactIds: selectedContactIds,
    currentTemplateId: templateIdForRequest ?? null,
    generateKey: () => crypto.randomUUID(),
    previousContactIds: contactSelectionSnapshot,
    previousIdempotencyKey: idempotencyKey,
    previousTemplateId: templateSelectionSnapshot,
  })
  if (resolvedIdempotency.idempotencyKey !== idempotencyKey) {
    setContactSelectionSnapshot(resolvedIdempotency.contactIds)
    setTemplateSelectionSnapshot(resolvedIdempotency.templateId)
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
        ...(templateIdForRequest === undefined ? {} : { templateId: templateIdForRequest }),
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
    setSelectedTemplateIdOverride(null)
    setTemplateSelectionSnapshot(null)
    setResult(null)
    sendMutation.reset()
  }

  function close(): void {
    setTarget(null)
    setSelectedContactIdsOverride(null)
    setSelectedTemplateIdOverride(null)
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

  function selectTemplate(templateId: string): void {
    setSelectedTemplateIdOverride(templateId)
  }

  function confirm(): void {
    if (!canConfirmAddressCorrectionMail(selectedContactIds.length, templates.length > 0)) return
    sendMutation.mutate()
  }

  return {
    close,
    confirm,
    contacts,
    canConfirm: canConfirmAddressCorrectionMail(selectedContactIds.length, templates.length > 0),
    errorCode: readErrorCode(sendMutation.error ?? recipientsQuery.error ?? templatesQuery.error),
    isOpen,
    isSending: sendMutation.isPending,
    open,
    preview: previewQuery.data,
    previewFailed: previewQuery.isError,
    previewLoading: isOpen && selectedTemplateId !== null && previewQuery.isFetching,
    recipientsFailed: recipientsQuery.isError,
    recipientsLoading: isOpen && recipientsQuery.isFetching,
    result,
    selectTemplate,
    selectedContactIds,
    selectedTemplateId,
    target,
    templates,
    templatesFailed: templatesQuery.isError,
    templatesLoading: isOpen && templatesQuery.isFetching,
    toggleContact,
  }
}
