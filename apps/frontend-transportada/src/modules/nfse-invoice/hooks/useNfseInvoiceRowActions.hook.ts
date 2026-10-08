/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

import {
  NFSE_INVOICE_DETAIL_QUERY_KEY,
  NFSE_INVOICE_DOCUMENTS_QUERY_KEY,
  NFSE_INVOICES_QUERY_KEY,
  type NfseCancellationMotive,
} from '../shared/nfseInvoice.constant'
import type {
  NfseInvoice,
  NfseInvoiceDetail,
  NfseInvoiceDocument,
  NfseInvoiceDocumentKind,
  NfseLastIssuancePayload,
} from '../shared/nfseInvoice.types'
import {
  buildNfseCancellationIdempotencyKey,
  buildNfseDiscardIdempotencyKey,
  buildNfseExternalLinkIdempotencyKey,
  buildNfseReissueCorrectionBody,
  buildNfseReissueIdempotencyKey,
  parseNfseProviderDocumentId,
  readNfseDownloadUrl,
  resolveNfseRowActions,
  validateNfseCancellationReason,
  type NfseRowActionState,
} from '../shared/nfseInvoiceRowActions.service'
import {
  findNationalTaxationFieldErrors,
  resolveReissueNationalTaxationValues,
} from '../shared/nfseNationalTaxation.service'
import { createNfseInvoiceController, getNfseInvoiceClient } from './useNfseInvoices.hook'

type UseNfseInvoiceRowActionsInput = Readonly<{
  companyId?: string
  /** Nota a abrir de saída, vinda do link da tabela de NF-e — só o identificador chega pela URL. */
  openInvoiceId?: null | string
  /** Injetado para o teste não abrir aba, e para a tela não depender de `window` no render. */
  openUrl?: (url: string) => void
  permissions: readonly string[]
}>

/**
 * Quem abre pela linha já tem a nota inteira; quem abre pelo link só tem o identificador. O alvo
 * guarda os dois casos e o diálogo prefere o detalhe carregado — assim o link não espera a listagem.
 */
type NfseDetailTarget = Readonly<{
  id: string
  invoice: NfseInvoice | null
}>

export type NfseInvoiceRowActionsController = ReturnType<typeof useNfseInvoiceRowActions>

function openInNewTab(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function readErrorCode(error: unknown): null | string {
  return error instanceof Error ? error.message : null
}

export function useNfseInvoiceRowActions(input: UseNfseInvoiceRowActionsInput) {
  const [detailTarget, setDetailTarget] = useState<NfseDetailTarget | null>(() =>
    input.openInvoiceId === undefined || input.openInvoiceId === null
      ? null
      : { id: input.openInvoiceId, invoice: null },
  )
  const [cancelTarget, setCancelTarget] = useState<NfseInvoice | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  /** Sem padrão de propósito: qual código a prefeitura lê é escolha de quem cancela, não nossa. */
  const [cancellationMotive, setCancellationMotive] = useState<'' | NfseCancellationMotive>('')
  const [attemptToken, setAttemptToken] = useState('')
  const [downloadErrorCode, setDownloadErrorCode] = useState<null | string>(null)
  const [reissueTarget, setReissueTarget] = useState<NfseInvoice | null>(null)
  const [reissueDraft, setReissueDraft] = useState<Partial<NfseLastIssuancePayload>>({})
  const [reissueAttemptToken, setReissueAttemptToken] = useState('')
  const [discardTarget, setDiscardTarget] = useState<NfseInvoice | null>(null)
  const [discardAttemptToken, setDiscardAttemptToken] = useState('')
  const [externalLinkTarget, setExternalLinkTarget] = useState<NfseInvoice | null>(null)
  const [providerDocumentId, setProviderDocumentId] = useState('')
  const [externalLinkAttemptToken, setExternalLinkAttemptToken] = useState('')

  const queryClient = useQueryClient()
  const permissions = input.companyId === undefined ? [] : input.permissions
  const controller = createNfseInvoiceController({
    client: getNfseInvoiceClient(),
    permissions,
  })
  const openUrl = input.openUrl ?? openInNewTab
  const detailInvoiceId = detailTarget?.id ?? null

  const detailQuery = useQuery<NfseInvoiceDetail>({
    enabled: detailInvoiceId !== null && controller.canReadInvoices,
    queryFn: () => controller.getInvoice({ invoiceId: detailInvoiceId ?? '' }),
    queryKey: [NFSE_INVOICE_DETAIL_QUERY_KEY, input.companyId, detailInvoiceId] as const,
  })
  const documentsQuery = useQuery<readonly NfseInvoiceDocument[]>({
    enabled: detailInvoiceId !== null && controller.canReadInvoices,
    queryFn: () => controller.listInvoiceDocuments({ invoiceId: detailInvoiceId ?? '' }),
    queryKey: [NFSE_INVOICE_DOCUMENTS_QUERY_KEY, input.companyId, detailInvoiceId] as const,
  })
  const reissueInvoiceId = reissueTarget?.id ?? null
  /** Mesma chave da consulta de detalhe: quem já abriu o detalhe reusa o `lastPayload` do cache. */
  const reissueDetailQuery = useQuery<NfseInvoiceDetail>({
    enabled: reissueInvoiceId !== null && controller.canReadInvoices,
    queryFn: () => controller.getInvoice({ invoiceId: reissueInvoiceId ?? '' }),
    queryKey: [NFSE_INVOICE_DETAIL_QUERY_KEY, input.companyId, reissueInvoiceId] as const,
  })

  const downloadMutation = useMutation({
    mutationFn: (query: Readonly<{ invoiceId: string; kind: NfseInvoiceDocumentKind }>) =>
      controller.getInvoiceDocumentUrl(query),
    onError: (error: unknown) => setDownloadErrorCode(readErrorCode(error)),
    onSuccess: (download) => openUrl(readNfseDownloadUrl(download)),
  })

  const cancelMutation = useMutation({
    mutationFn: controller.cancelInvoice,
    onSuccess: () => {
      setCancelTarget(null)
      setCancellationReason('')
      setCancellationMotive('')
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: [NFSE_INVOICES_QUERY_KEY] }),
        invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient }),
      ])
    },
  })

  const reasonCheck = validateNfseCancellationReason(cancellationReason)
  const isCancelReady = reasonCheck.status === 'ready' && cancellationMotive !== ''

  function closeCancel(): void {
    setCancelTarget(null)
    setCancellationReason('')
    setCancellationMotive('')
    cancelMutation.reset()
  }

  const reissueMutation = useMutation({
    mutationFn: controller.reissueInvoice,
    onSuccess: () => {
      setReissueTarget(null)
      setReissueDraft({})
      return queryClient.invalidateQueries({ queryKey: [NFSE_INVOICES_QUERY_KEY] })
    },
  })

  function closeReissue(): void {
    setReissueTarget(null)
    setReissueDraft({})
    reissueMutation.reset()
  }

  const discardMutation = useMutation({
    mutationFn: controller.discardInvoice,
    // Reemitir retransmite o mesmo RPS e não mexe no vínculo; descartar devolve a nota fiscal.
    onSuccess: () => {
      setDiscardTarget(null)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: [NFSE_INVOICES_QUERY_KEY] }),
        invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient }),
      ])
    },
  })

  function closeDiscard(): void {
    setDiscardTarget(null)
    discardMutation.reset()
  }

  const externalLinkMutation = useMutation({
    mutationFn: controller.linkExternalInvoice,
    onSuccess: () => {
      setExternalLinkTarget(null)
      setProviderDocumentId('')
      return queryClient.invalidateQueries({ queryKey: [NFSE_INVOICES_QUERY_KEY] })
    },
  })

  const parsedProviderDocumentId = parseNfseProviderDocumentId(providerDocumentId)

  function closeExternalLink(): void {
    setExternalLinkTarget(null)
    setProviderDocumentId('')
    externalLinkMutation.reset()
  }

  const reissueNationalTaxationValues = resolveReissueNationalTaxationValues({
    draft: reissueDraft,
    frozen: reissueDetailQuery.data?.lastPayload ?? {},
  })
  const nationalTaxationErrors = findNationalTaxationFieldErrors(reissueNationalTaxationValues)
  const isReissueNationalTaxationValid =
    !nationalTaxationErrors.code && !nationalTaxationErrors.rate

  return {
    cancelErrorCode: readErrorCode(cancelMutation.error),
    cancellationMotive,
    cancellationReason,
    cancelTarget,
    closeCancel,
    closeDetail: () => setDetailTarget(null),
    confirmCancel: () => {
      if (cancelTarget === null || cancellationMotive === '' || reasonCheck.status !== 'ready')
        return
      cancelMutation.mutate({
        cancellationMotive,
        cancellationReason: reasonCheck.value,
        idempotencyKey: buildNfseCancellationIdempotencyKey({
          invoiceId: cancelTarget.id,
          token: attemptToken,
        }),
        invoiceId: cancelTarget.id,
      })
    },
    closeDiscard,
    closeExternalLink,
    closeReissue,
    confirmDiscard: () => {
      if (discardTarget === null) return
      discardMutation.mutate({
        idempotencyKey: buildNfseDiscardIdempotencyKey({
          invoiceId: discardTarget.id,
          token: discardAttemptToken,
        }),
        invoiceId: discardTarget.id,
      })
    },
    confirmExternalLink: () => {
      if (externalLinkTarget === null || parsedProviderDocumentId === null) return
      externalLinkMutation.mutate({
        idempotencyKey: buildNfseExternalLinkIdempotencyKey({
          invoiceId: externalLinkTarget.id,
          token: externalLinkAttemptToken,
        }),
        invoiceId: externalLinkTarget.id,
        providerDocumentId: parsedProviderDocumentId,
      })
    },
    confirmReissue: () => {
      const lastPayload = reissueDetailQuery.data?.lastPayload
      if (reissueTarget === null || lastPayload === null || lastPayload === undefined) return
      if (!isReissueNationalTaxationValid) return
      reissueMutation.mutate({
        correction: buildNfseReissueCorrectionBody({
          edited: reissueDraft,
          lastPayload,
        }),
        idempotencyKey: buildNfseReissueIdempotencyKey({
          invoiceId: reissueTarget.id,
          token: reissueAttemptToken,
        }),
        invoiceId: reissueTarget.id,
      })
    },
    detail: detailQuery.data ?? null,
    detailTarget,
    discardErrorCode: readErrorCode(discardMutation.error),
    discardTarget,
    documents: documentsQuery.data ?? [],
    downloadErrorCode,
    externalLinkErrorCode: readErrorCode(externalLinkMutation.error),
    externalLinkTarget,
    downloadInvoice: (invoiceId: string, kind: NfseInvoiceDocumentKind) => {
      setDownloadErrorCode(null)
      downloadMutation.mutate({ invoiceId, kind })
    },
    isCancelPending: cancelMutation.isPending,
    isCancelReady,
    isDetailLoading: detailQuery.isLoading || documentsQuery.isLoading,
    isDiscardPending: discardMutation.isPending,
    isDownloadPending: downloadMutation.isPending,
    isExternalLinkPending: externalLinkMutation.isPending,
    isExternalLinkReady: parsedProviderDocumentId !== null,
    isReissueDetailLoading: reissueDetailQuery.isLoading,
    isReissueNationalTaxationValid,
    isReissuePending: reissueMutation.isPending,
    openCancel: (invoice: NfseInvoice) => {
      setCancelTarget(invoice)
      setCancellationReason('')
      setCancellationMotive('')
      setAttemptToken(crypto.randomUUID())
      cancelMutation.reset()
    },
    openDetail: (invoice: NfseInvoice) => setDetailTarget({ id: invoice.id, invoice }),
    openDiscard: (invoice: NfseInvoice) => {
      setDiscardTarget(invoice)
      setDiscardAttemptToken(crypto.randomUUID())
      discardMutation.reset()
    },
    openExternalLink: (invoice: NfseInvoice) => {
      setExternalLinkTarget(invoice)
      setProviderDocumentId('')
      setExternalLinkAttemptToken(crypto.randomUUID())
      externalLinkMutation.reset()
    },
    openReissue: (invoice: NfseInvoice) => {
      setReissueTarget(invoice)
      setReissueDraft({})
      setReissueAttemptToken(crypto.randomUUID())
      reissueMutation.reset()
    },
    providerDocumentId,
    reasonBlock: reasonCheck.status === 'blocked' ? reasonCheck.reason : null,
    reissueDraft,
    reissueErrorCode: readErrorCode(reissueMutation.error),
    reissueLastPayload: reissueDetailQuery.data?.lastPayload ?? null,
    reissueNationalTaxationValues,
    reissueTarget,
    resolveActions: (status: string): NfseRowActionState =>
      resolveNfseRowActions({ permissions, status }),
    setCancellationMotive,
    setCancellationReason,
    setProviderDocumentId,
    setReissueField: (change: Partial<NfseLastIssuancePayload>) =>
      setReissueDraft((previous) => ({ ...previous, ...change })),
  }
}
