/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { getCteBatchClient } from '@/modules/cte-batch/hooks/useCteBatchWorkspace.hook'
import type { CteBatchSummary } from '@/modules/cte-batch/shared/cteBatchClient.service'
import { useCteProfiles } from '@/modules/cte-profiles/hooks/useCteProfiles.hook'

import {
  AUTOMATIC_PROFILE_ID,
  DEFAULT_GROUPING_MODE,
  buildCreateRequest,
  buildPreviewRequest,
  canConfirmEmission,
  defaultBatchName,
  groupBlocksByReason,
  summarizePreview,
  type CteEmissionBlockGroup,
  type CteEmissionGroupingMode,
  type CteEmissionPreview,
  type CteEmissionStatus,
  type CteEmissionSummary,
} from '../shared/cteEmission.service'

const CTE_MANAGE_PERMISSION = 'cte.manage'
const CTE_EMISSION_PREVIEW_QUERY_KEY = 'cte-emission-preview'

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
  close: () => void
  confirm: () => void
  createdBatch: CteBatchSummary | null
  errorCode: null | string
  groupingMode: CteEmissionGroupingMode
  isOpen: boolean
  name: string
  open: () => void
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
  const [name, setName] = useState('')
  const [createdBatch, setCreatedBatch] = useState<CteBatchSummary | null>(null)

  const permissions = input.companyId === undefined ? [] : input.permissions
  const canEmit = permissions.includes(CTE_MANAGE_PERMISSION)
  const client = getCteBatchClient()
  const profiles = useCteProfiles({
    ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
    filters: { statusEq: 'active' },
    permissions,
  })
  const selection = { documentIds: input.documentIds, emissionProfileId: profileId, groupingMode }

  const previewQuery = useQuery({
    enabled: isOpen && canEmit && input.documentIds.length > 0,
    queryFn: () => client.previewBatch(buildPreviewRequest(selection)),
    queryKey: [
      CTE_EMISSION_PREVIEW_QUERY_KEY,
      input.companyId,
      input.documentIds,
      profileId,
      groupingMode,
    ] as const,
  })
  const createMutation = useMutation({
    mutationFn: (documentIds: readonly string[]) =>
      client.createBatch(buildCreateRequest({ ...selection, documentIds, name })),
    onSuccess: (batch) => {
      setCreatedBatch(batch)
      setIsOpen(false)
      input.onEmitted()
    },
  })

  const preview = previewQuery.data ?? null
  const summary = preview === null ? null : summarizePreview(preview)
  const status: CteEmissionStatus = createMutation.isPending
    ? 'creating'
    : previewQuery.isError || createMutation.isError
      ? 'error'
      : previewQuery.isFetching || preview === null
        ? 'loading'
        : 'ready'

  function open(): void {
    setCreatedBatch(null)
    setName(
      defaultBatchName({ count: input.documentIds.length, issuedAt: new Date().toISOString() }),
    )
    setIsOpen(true)
  }

  function close(): void {
    setIsOpen(false)
    createMutation.reset()
  }

  function confirm(): void {
    if (summary === null) return
    createMutation.mutate(summary.projectedDocumentIds)
  }

  return {
    blockGroups: preview === null ? [] : groupBlocksByReason(preview.blocked),
    canConfirm: canConfirmEmission({ preview, status }),
    canEmit,
    close,
    confirm,
    createdBatch,
    errorCode: readErrorCode(previewQuery.error ?? createMutation.error),
    groupingMode,
    isOpen,
    name,
    open,
    preview,
    profileId,
    profileOptions: (profiles.profilesQuery.data?.items ?? []).map((profile) => ({
      id: profile.id,
      name: profile.name,
    })),
    selectedCount: input.documentIds.length,
    setGroupingMode,
    setName,
    setProfileId,
    status,
    summary,
  }
}
