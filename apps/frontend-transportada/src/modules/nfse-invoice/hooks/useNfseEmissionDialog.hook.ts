/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { NFE_DOCUMENTS_QUERY_KEY } from '@/modules/nfe-workspace/shared/nfeWorkspace.constant'

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
  NFSE_EMISSION_MAX_VISIBLE_ROWS,
  NFSE_EMISSION_PREVIEW_QUERY_KEY,
  resolveNfseDescription,
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
  NFSE_SETTINGS_MANAGE_PERMISSION,
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
  hiddenRowCount: number
  isFormLocked: boolean
  isOpen: boolean
  open: () => void
  profileId: null | string
  profileOptions: readonly NfseEmissionSelectOption[]
  selectedCount: number
  setDescription: (description: string) => void
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
  const [selectedProfileId, setSelectedProfileId] = useState<null | string>(null)
  const [customDescription, setCustomDescription] = useState<null | string>(null)
  const [attemptToken, setAttemptToken] = useState('')

  const permissions = input.companyId === undefined ? [] : input.permissions
  const canOpen = canOpenNfseEmission(permissions)
  const canIssue = permissions.includes(NFSE_ISSUE_PERMISSION)
  // `GET /nfse-emission-profiles` exige `settings.manage`, e o perfil é obrigatório na criação.
  const canListProfiles = permissions.includes(NFSE_SETTINGS_MANAGE_PERMISSION)
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
  const profileTemplate =
    profiles.find((profile) => profile.id === profileId)?.descriptionTemplate ?? ''
  const description = resolveNfseDescription({ custom: customDescription, profileTemplate })

  const previewQuery = useQuery({
    enabled: isOpen && canOpen && profileId !== null && input.documentIds.length > 0,
    queryFn: () =>
      controller.previewInvoices(
        buildNfsePreviewRequest({
          description,
          documentIds: input.documentIds,
          profileId: profileId ?? '',
          profileTemplate,
        }),
      ),
    queryKey: buildNfsePreviewQueryKey({
      ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
      description,
      documentIds: input.documentIds,
      profileId,
      profileTemplate,
    }),
  })

  function forgetPreviews(): void {
    void queryClient.invalidateQueries({ queryKey: [NFSE_EMISSION_PREVIEW_QUERY_KEY] })
  }

  function forgetNoteList(): void {
    void queryClient.invalidateQueries({ queryKey: [NFE_DOCUMENTS_QUERY_KEY] })
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
      forgetPreviews()
      forgetNoteList()
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
        isPreviewError: previewQuery.isError,
        isPreviewFetching: previewQuery.isFetching,
      })
    : 'idle'
  const rows = summary?.rows ?? []

  function open(): void {
    setSelectedProfileId(null)
    setCustomDescription(null)
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
    createMutation.mutate(buildNfseCreateRequests({ description, profileTemplate, summary }))
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
    hiddenRowCount: Math.max(0, rows.length - NFSE_EMISSION_MAX_VISIBLE_ROWS),
    isFormLocked: isNfseEmissionFormLocked(status),
    isOpen,
    open,
    profileId,
    profileOptions: buildNfseProfileSelectOptions(profiles),
    selectedCount: input.documentIds.length,
    setDescription: setCustomDescription,
    setProfileId: setSelectedProfileId,
    status,
    summary,
    visibleRows: rows.slice(0, NFSE_EMISSION_MAX_VISIBLE_ROWS),
  }
}
