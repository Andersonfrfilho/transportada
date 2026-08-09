/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { getCteBatchClient } from '@/modules/cte-batch/hooks/useCteBatchWorkspace.hook'
import type { CteBatchSummary } from '@/modules/cte-batch/shared/cteBatchClient.service'
import { useCteProfiles } from '@/modules/cte-profiles/hooks/useCteProfiles.hook'

import {
  AUTOMATIC_PROFILE_ID,
  CTE_EMISSION_PREVIEW_QUERY_KEY,
  DEFAULT_GROUPING_MODE,
  buildCreateRequest,
  buildPreviewQueryKey,
  buildPreviewRequest,
  canConfirmEmission,
  defaultBatchName,
  groupBlocksByReason,
  isEmissionFormLocked,
  resolveBatchName,
  resolveEmissionStatus,
  shouldRefreshPreviewAfterFailure,
  summarizePreview,
  type CteEmissionBlockGroup,
  type CteEmissionGroupingMode,
  type CteEmissionPreview,
  type CteEmissionStatus,
  type CteEmissionSummary,
} from '../shared/cteEmission.service'
import { NFE_DOCUMENTS_QUERY_KEY } from '../shared/nfeWorkspace.constant'
import {
  canReachCteProfiles,
  createBrowserWorkspaceNavigator,
  navigateToCteProfiles,
} from '../shared/cteProfilesNavigation.service'

const CTE_MANAGE_PERMISSION = 'cte.manage'

export type CteEmissionProfileOption = Readonly<{ id: string; name: string }>

type UseCteEmissionDialogParams = Readonly<{
  companyId?: string
  documentIds: readonly string[]
  onEmitted: () => void
  permissions: readonly string[]
}>

export type UseCteEmissionDialogResult = Readonly<{
  blockGroups: readonly CteEmissionBlockGroup[]
  canConfirm: boolean
  canEmit: boolean
  canManageProfiles: boolean
  close: () => void
  confirm: () => void
  createdBatch: CteBatchSummary | null
  errorCode: null | string
  groupingMode: CteEmissionGroupingMode
  isFormLocked: boolean
  isOpen: boolean
  name: string
  open: () => void
  openProfileSettings: () => void
  preview: CteEmissionPreview | null
  profileId: string
  profileOptions: readonly CteEmissionProfileOption[]
  selectedCount: number
  setGroupingMode: (mode: CteEmissionGroupingMode) => void
  setName: (name: string) => void
  setProfileId: (profileId: string) => void
  status: CteEmissionStatus
  summary: CteEmissionSummary | null
}>

function readErrorCode(error: unknown): null | string {
  return error instanceof Error ? error.message : null
}

export function useCteEmissionDialog(
  input: UseCteEmissionDialogParams,
): UseCteEmissionDialogResult {
  const [isOpen, setIsOpen] = useState(false)
  const [profileId, setProfileId] = useState(AUTOMATIC_PROFILE_ID)
  const [groupingMode, setGroupingMode] = useState<CteEmissionGroupingMode>(DEFAULT_GROUPING_MODE)
  const [customName, setCustomName] = useState<null | string>(null)
  const [fallbackName, setFallbackName] = useState('')
  const [createdBatch, setCreatedBatch] = useState<CteBatchSummary | null>(null)

  const permissions = input.companyId === undefined ? [] : input.permissions
  const canEmit = permissions.includes(CTE_MANAGE_PERMISSION)
  const client = getCteBatchClient()
  const queryClient = useQueryClient()
  const profiles = useCteProfiles({
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    filters: { statusEq: 'active' },
    permissions,
  })
  const selection = { documentIds: input.documentIds, emissionProfileId: profileId, groupingMode }

  function forgetPreviews(): void {
    void queryClient.invalidateQueries({ queryKey: [CTE_EMISSION_PREVIEW_QUERY_KEY] })
  }

  function forgetNoteList(): void {
    void queryClient.invalidateQueries({ queryKey: [NFE_DOCUMENTS_QUERY_KEY] })
  }

  const previewQuery = useQuery({
    enabled: isOpen && canEmit && input.documentIds.length > 0,
    queryFn: () => client.previewBatch(buildPreviewRequest(selection)),
    queryKey: buildPreviewQueryKey({ ...selection, companyId: input.companyId }),
  })
  const createMutation = useMutation({
    mutationFn: (documentIds: readonly string[]) =>
      client.createBatch(buildCreateRequest({ ...selection, documentIds, name })),
    onError: (error) => {
      if (shouldRefreshPreviewAfterFailure(readErrorCode(error))) forgetPreviews()
    },
    onSuccess: (batch) => {
      // O lote recém-criado prende as notas: qualquer projeção em cache passou a mentir.
      forgetPreviews()
      // A lista em cache ainda mostra as notas como "sem CT-e" — sem isso só um reload corrige.
      forgetNoteList()
      setCreatedBatch(batch)
      setIsOpen(false)
      input.onEmitted()
    },
  })

  const preview = previewQuery.data ?? null
  const summary = preview === null ? null : summarizePreview(preview)
  const name = resolveBatchName({
    customName,
    fallbackName,
    suggestedName: preview?.suggestedName ?? '',
  })
  const status: CteEmissionStatus = resolveEmissionStatus({
    hasPreview: preview !== null,
    isCreateError: createMutation.isError,
    isCreating: createMutation.isPending,
    isPreviewError: previewQuery.isError,
    isPreviewFetching: previewQuery.isFetching,
  })

  function open(): void {
    setCreatedBatch(null)
    setCustomName(null)
    setFallbackName(
      defaultBatchName({ count: input.documentIds.length, issuedAt: new Date().toISOString() }),
    )
    setIsOpen(true)
  }

  function close(): void {
    setIsOpen(false)
    createMutation.reset()
  }

  function openProfileSettings(): void {
    setIsOpen(false)
    navigateToCteProfiles(createBrowserWorkspaceNavigator())
  }

  function confirm(): void {
    if (summary === null) return
    createMutation.mutate(summary.projectedDocumentIds)
  }

  return {
    blockGroups: preview === null ? [] : groupBlocksByReason(preview.blocked),
    canConfirm: canConfirmEmission({ preview, status }),
    canEmit,
    canManageProfiles: canReachCteProfiles(permissions),
    close,
    confirm,
    createdBatch,
    errorCode: readErrorCode(previewQuery.error ?? createMutation.error),
    groupingMode,
    isFormLocked: isEmissionFormLocked(status),
    isOpen,
    name,
    open,
    openProfileSettings,
    preview,
    profileId,
    profileOptions: (profiles.profilesQuery.data?.items ?? []).map((profile) => ({
      id: profile.id,
      name: profile.name,
    })),
    selectedCount: input.documentIds.length,
    setGroupingMode,
    setName: setCustomName,
    setProfileId,
    status,
    summary,
  }
}
