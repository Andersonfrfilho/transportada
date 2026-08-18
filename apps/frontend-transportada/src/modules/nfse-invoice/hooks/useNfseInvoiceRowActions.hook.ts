/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

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
} from '../shared/nfseInvoice.types'
import {
  buildNfseCancellationIdempotencyKey,
  readNfseDownloadUrl,
  resolveNfseRowActions,
  validateNfseCancellationReason,
  type NfseRowActionState,
} from '../shared/nfseInvoiceRowActions.service'
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
      return queryClient.invalidateQueries({ queryKey: [NFSE_INVOICES_QUERY_KEY] })
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
    detail: detailQuery.data ?? null,
    detailTarget,
    documents: documentsQuery.data ?? [],
    downloadErrorCode,
    downloadInvoice: (invoiceId: string, kind: NfseInvoiceDocumentKind) => {
      setDownloadErrorCode(null)
      downloadMutation.mutate({ invoiceId, kind })
    },
    isCancelPending: cancelMutation.isPending,
    isCancelReady,
    isDetailLoading: detailQuery.isLoading || documentsQuery.isLoading,
    isDownloadPending: downloadMutation.isPending,
    openCancel: (invoice: NfseInvoice) => {
      setCancelTarget(invoice)
      setCancellationReason('')
      setCancellationMotive('')
      setAttemptToken(crypto.randomUUID())
      cancelMutation.reset()
    },
    openDetail: (invoice: NfseInvoice) => setDetailTarget({ id: invoice.id, invoice }),
    reasonBlock: reasonCheck.status === 'blocked' ? reasonCheck.reason : null,
    resolveActions: (status: string): NfseRowActionState =>
      resolveNfseRowActions({ permissions, status }),
    setCancellationMotive,
    setCancellationReason,
  }
}
