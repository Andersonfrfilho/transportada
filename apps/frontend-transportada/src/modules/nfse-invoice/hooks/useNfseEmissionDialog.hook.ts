/* Copyright (c) 2026 Ada Technology. MIT License. */
import { paginateRows } from '@/modules/shared/rowPagination.service'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

import {
  buildNfseCreateRequests,
  buildNfseIdempotencyKeys,
  buildNfsePreviewQueryKey,
  buildNfsePreviewRequest,
  buildNfseProfileSelectOptions,
  canConfirmNfseEmission,
  canOpenNfseEmission,
  groupNfseBlocksByReason,
  isNfseEmissionFormLocked,
  NFSE_EMISSION_DEFAULT_PAGE_SIZE,
  type NfseEmissionPageSize,
  resolveNfseDescription,
  resolveNfseEmissionProfileStatus,
  resolveNfseEmissionStatus,
  summarizeNfsePreview,
  type NfseEmissionBlockGroup,
  type NfseEmissionRow,
  type NfseEmissionSelectOption,
  type NfseEmissionStatus,
  type NfseEmissionSummary,
} from '../shared/nfseEmission.service'
import {
  NFSE_EMISSION_PROFILES_QUERY_KEY,
  NFSE_ISSUE_PERMISSION,
} from '../shared/nfseInvoice.constant'
import type { NfseInvoiceSelection, NfseIssuanceSummary } from '../shared/nfseInvoice.types'
import { createNfseInvoiceController, getNfseInvoiceClient } from './useNfseInvoices.hook'

type UseNfseEmissionDialogParams = Readonly<{
  companyId?: string
  documentIds: readonly string[]
  onEmitted: () => void
  permissions: readonly string[]
}>

export type UseNfseEmissionDialogResult = Readonly<{
  blockGroups: readonly NfseEmissionBlockGroup[]
  canConfirm: boolean
  canIssue: boolean
  canListProfiles: boolean
  canOpen: boolean
  close: () => void
  confirm: () => void
  description: string
  errorCode: null | string
  canGoToPreviousPage: boolean
  goToNextPage: () => void
  goToPreviousPage: () => void
  hasNextPage: boolean
  pageCount: number
  pageNumber: number
  pageSize: NfseEmissionPageSize
  rowsFirstShown: number
  rowsLastShown: number
  rowsTotal: number
  setPageSize: (size: NfseEmissionPageSize) => void
  isFormLocked: boolean
  isOpen: boolean
  open: () => void
  period: string
  profileId: null | string
  profileOptions: readonly NfseEmissionSelectOption[]
  selectedCount: number
  setDescription: (description: string) => void
  setPeriod: (period: string) => void
  setProfileId: (profileId: string) => void
  status: NfseEmissionStatus
  summary: NfseEmissionSummary | null
  visibleRows: readonly NfseEmissionRow[]
}>

function readErrorCode(error: unknown): null | string {
  return error instanceof Error ? error.message : null
}

export function useNfseEmissionDialog(
  input: UseNfseEmissionDialogParams,
): UseNfseEmissionDialogResult {
  const [isOpen, setIsOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeState] = useState<NfseEmissionPageSize>(
    NFSE_EMISSION_DEFAULT_PAGE_SIZE,
  )
  const [selectedProfileId, setSelectedProfileId] = useState<null | string>(null)
  const [customDescription, setCustomDescription] = useState<null | string>(null)
  // Nasce vazio e só o operador o preenche: nenhuma janela é derivada das notas selecionadas.
  const [period, setPeriod] = useState('')
  const [attemptToken, setAttemptToken] = useState('')

  const permissions = input.companyId === undefined ? [] : input.permissions
  const canOpen = canOpenNfseEmission(permissions)
  const canIssue = permissions.includes(NFSE_ISSUE_PERMISSION)
  // As opções de perfil vêm da rota de emissão: quem emite lê a lista com a própria permissão.
  const canListProfiles = permissions.includes(NFSE_ISSUE_PERMISSION)
  const client = getNfseInvoiceClient()
  const controller = createNfseInvoiceController({ client, permissions })
  const queryClient = useQueryClient()

  const profilesQuery = useQuery({
    enabled: isOpen && canListProfiles,
    queryFn: () => client.listEmissionProfiles(),
    queryKey: [NFSE_EMISSION_PROFILES_QUERY_KEY, input.companyId],
  })

  const profiles = profilesQuery.data ?? []
  const profileId = selectedProfileId ?? profiles[0]?.id ?? null
  const profileStatus = resolveNfseEmissionProfileStatus({
    canListProfiles,
    isError: profilesQuery.isError,
    // `isPending` cobre o primeiro render, antes de a busca começar: sem ele "nenhum perfil" pisca.
    isLoading: profilesQuery.isPending || profilesQuery.isFetching,
    profileCount: profiles.length,
  })
  const profileTemplate =
    profiles.find((profile) => profile.id === profileId)?.descriptionTemplate ?? ''
  const description = resolveNfseDescription({ custom: customDescription, profileTemplate })

  // O estado do diálogo lê a mesma condição que liga a query: prévia desligada não é espera.
  const isPreviewEnabled = isOpen && canOpen && profileId !== null && input.documentIds.length > 0

  const previewQuery = useQuery({
    enabled: isPreviewEnabled,
    queryFn: () =>
      controller.previewInvoices(
        buildNfsePreviewRequest({
          description,
          documentIds: input.documentIds,
          period,
          profileId: profileId ?? '',
          profileTemplate,
        }),
      ),
    queryKey: buildNfsePreviewQueryKey({
      ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
      description,
      documentIds: input.documentIds,
      period,
      profileId,
      profileTemplate,
    }),
  })

  /** Emitir prende a nota: a listagem e as prévias saem do registro de efeitos, não daqui. */
  function forgetLinkedViews(): void {
    void invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient })
  }

  const createMutation = useMutation({
    mutationFn: async (requests: readonly NfseInvoiceSelection[]) => {
      const idempotencyKeys = buildNfseIdempotencyKeys({
        count: requests.length,
        token: attemptToken,
      })
      const summaries: NfseIssuanceSummary[] = []

      // Criações concorrentes disputariam a linha de cada nota; em série cada tomador espera a sua.
      for (const [index, request] of requests.entries()) {
        const idempotencyKey = idempotencyKeys[index] ?? attemptToken
        summaries.push(await controller.createInvoices({ ...request, idempotencyKey }))
      }

      return summaries
    },
    onSettled: () => {
      forgetLinkedViews()
    },
    onSuccess: () => {
      setIsOpen(false)
      input.onEmitted()
    },
  })

  const preview = previewQuery.data ?? null
  const summary = preview === null ? null : summarizeNfsePreview(preview)
  const status = isOpen
    ? resolveNfseEmissionStatus({
        hasPreview: preview !== null,
        isCreateError: createMutation.isError,
        isCreating: createMutation.isPending,
        isPreviewEnabled,
        isPreviewError: previewQuery.isError,
        isPreviewFetching: previewQuery.isFetching,
        profileStatus,
      })
    : 'idle'
  const rows = summary?.rows ?? []
  const rowPage = paginateRows({ page, pageSize, rows })

  function setPageSize(size: NfseEmissionPageSize): void {
    setPageSizeState(size)
    setPage(1)
  }

  function goToPreviousPage(): void {
    setPage(rowPage.pageNumber - 1)
  }

  function goToNextPage(): void {
    setPage(rowPage.pageNumber + 1)
  }

  function open(): void {
    setPage(1)
    setSelectedProfileId(null)
    setCustomDescription(null)
    setPeriod('')
    setAttemptToken(crypto.randomUUID())
    createMutation.reset()
    setIsOpen(true)
  }

  function close(): void {
    setIsOpen(false)
    createMutation.reset()
  }

  function confirm(): void {
    if (summary === null) return
    createMutation.mutate(
      buildNfseCreateRequests({ description, period, profileTemplate, summary }),
    )
  }

  return {
    blockGroups: preview === null ? [] : groupNfseBlocksByReason(preview.blocked),
    canConfirm: canConfirmNfseEmission({ canIssue, profileId, status, summary }),
    canIssue,
    canListProfiles,
    canOpen,
    close,
    confirm,
    description,
    errorCode: readErrorCode(previewQuery.error ?? createMutation.error),
    canGoToPreviousPage: rowPage.canGoToPreviousPage,
    goToNextPage,
    goToPreviousPage,
    hasNextPage: rowPage.hasNextPage,
    isFormLocked: isNfseEmissionFormLocked(status),
    isOpen,
    open,
    period,
    profileId,
    profileOptions: buildNfseProfileSelectOptions(profiles),
    pageCount: rowPage.pageCount,
    pageNumber: rowPage.pageNumber,
    pageSize,
    rowsFirstShown: rowPage.firstShown,
    rowsLastShown: rowPage.lastShown,
    rowsTotal: rowPage.total,
    selectedCount: input.documentIds.length,
    setDescription: setCustomDescription,
    setPageSize,
    setPeriod,
    setProfileId: setSelectedProfileId,
    status,
    summary,
    visibleRows: rowPage.rows,
  }
}
