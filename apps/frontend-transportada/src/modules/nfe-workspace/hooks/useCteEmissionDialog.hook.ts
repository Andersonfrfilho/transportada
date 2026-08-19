/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { getCteBatchClient } from '@/modules/cte-batch/hooks/useCteBatchWorkspace.hook'
import type { CteBatchSummary } from '@/modules/cte-batch/shared/cteBatchClient.service'
import { useCteProfiles } from '@/modules/cte-profiles/hooks/useCteProfiles.hook'
import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

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
  type CteEmissionRow,
  type CteEmissionStatus,
  type CteEmissionSummary,
} from '../shared/cteEmission.service'
import {
  chunkEmissionSelection,
  CTE_EMISSION_MAX_VISIBLE_ROWS,
  CTE_EMISSION_PREVIEW_CONCURRENCY,
  mergeEmissionPreviews,
  resolveEmissionProgress,
  runEmissionQueue,
  type CteEmissionChunkResult,
  type CteEmissionProgress,
  type CteEmissionProgressEvent,
} from '../shared/cteEmissionQueue.service'
import {
  canReachCteProfiles,
  createBrowserWorkspaceNavigator,
  navigateToCteProfiles,
} from '../shared/cteProfilesNavigation.service'

const CTE_MANAGE_PERMISSION = 'cte.manage'

export type CteEmissionProfileOption = Readonly<{ id: string; name: string; percentage: string }>

type UseCteEmissionDialogParams = Readonly<{
  companyId?: string
  documentIds: readonly string[]
  /** Par remetente/destinatário de cada nota: é o que permite fatiar sem partir um CT-e agrupado. */
  groupKeyByDocumentId: ReadonlyMap<string, string>
  onEmitted: () => void
  permissions: readonly string[]
}>

export type UseCteEmissionDialogResult = Readonly<{
  blockGroups: readonly CteEmissionBlockGroup[]
  canConfirm: boolean
  canEmit: boolean
  canManageProfiles: boolean
  chunkCount: number
  createProgress: CteEmissionProgress
  close: () => void
  confirm: () => void
  createdBatch: CteBatchSummary | null
  errorCode: null | string
  groupingMode: CteEmissionGroupingMode
  hiddenRowCount: number
  isFormLocked: boolean
  isOpen: boolean
  name: string
  open: () => void
  openProfileSettings: () => void
  preview: CteEmissionPreview | null
  previewProgress: CteEmissionProgress
  profileId: string
  profileOptions: readonly CteEmissionProfileOption[]
  selectedCount: number
  setGroupingMode: (mode: CteEmissionGroupingMode) => void
  setName: (name: string) => void
  setProfileId: (profileId: string) => void
  status: CteEmissionStatus
  summary: CteEmissionSummary | null
  visibleRows: readonly CteEmissionRow[]
}>

const IDLE_PROGRESS: CteEmissionProgressEvent = { completed: 0, errorCount: 0, total: 0 }
const REQUEST_FAILED_CODE = 'CTE_BATCH_REQUEST_FAILED'

function readErrorCode(error: unknown): null | string {
  return error instanceof Error ? error.message : null
}

function firstErrorCode(results: readonly CteEmissionChunkResult<unknown>[]): null | string {
  return results.find((result) => result.errorCode !== null)?.errorCode ?? null
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
  const [previewProgressEvent, setPreviewProgressEvent] = useState(IDLE_PROGRESS)
  const [createProgressEvent, setCreateProgressEvent] = useState(IDLE_PROGRESS)

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
  const groupKeyByDocumentId = input.groupKeyByDocumentId
  const chunks = useMemo(
    () =>
      chunkEmissionSelection({
        documentIds: input.documentIds,
        groupKeyByDocumentId,
        groupingMode,
      }),
    [input.documentIds, groupKeyByDocumentId, groupingMode],
  )

  function forgetPreviews(): void {
    void queryClient.invalidateQueries({ queryKey: [CTE_EMISSION_PREVIEW_QUERY_KEY] })
  }

  /** Emitir prende a nota: a listagem e as prévias saem do registro de efeitos, não daqui. */
  function forgetLinkedViews(): void {
    void invalidateMutationEffect({ effect: MUTATION_EFFECT.nfeDocumentLink, queryClient })
  }

  // A projeção da seleção inteira sai numa fatia por requisição, em paralelo limitado: o progresso
  // anda a cada fatia que volta, em vez da tela ficar parada até a última.
  const previewQuery = useQuery({
    enabled: isOpen && canEmit && chunks.length > 0,
    queryFn: async () => {
      setPreviewProgressEvent({ completed: 0, errorCount: 0, total: chunks.length })
      const results = await runEmissionQueue({
        chunks,
        concurrency: CTE_EMISSION_PREVIEW_CONCURRENCY,
        onProgress: setPreviewProgressEvent,
        run: (chunk) =>
          client.previewBatch(
            buildPreviewRequest({ ...selection, documentIds: chunk.documentIds }),
          ),
      })
      // Projeção parcial mentiria no total e no que o operador está prestes a confirmar.
      const failure = firstErrorCode(results)
      if (failure !== null) throw new Error(failure)

      return mergeEmissionPreviews(
        results.flatMap((result) => (result.value === null ? [] : [result.value])),
      )
    },
    queryKey: buildPreviewQueryKey({ ...selection, companyId: input.companyId }),
  })
  // O operador escolheu um lote e é um lote que ele recebe: a seleção é fatiada só porque o corpo da
  // requisição tem teto — a primeira fatia cria o rascunho e as demais acrescentam itens nele.
  const createMutation = useMutation({
    mutationFn: async (documentIds: readonly string[]) => {
      const createChunks = chunkEmissionSelection({
        documentIds,
        groupKeyByDocumentId,
        groupingMode,
      })
      const [firstChunk, ...remainingChunks] = createChunks
      if (firstChunk === undefined) throw new Error(REQUEST_FAILED_CODE)

      setCreateProgressEvent({ completed: 0, errorCount: 0, total: createChunks.length })
      const batch = await client.createBatch(
        buildCreateRequest({ ...selection, documentIds: firstChunk.documentIds, name }),
      )
      setCreateProgressEvent({ completed: 1, errorCount: 0, total: createChunks.length })

      // Fatias concorrentes disputariam a trava da linha do lote: em série, sem fila desperdiçada.
      const results = await runEmissionQueue({
        chunks: remainingChunks,
        concurrency: 1,
        onProgress: (event) =>
          setCreateProgressEvent({
            ...event,
            completed: event.completed + 1,
            total: createChunks.length,
          }),
        run: (chunk) =>
          client.appendBatchItems({
            batchId: batch.id,
            ...buildPreviewRequest({ ...selection, documentIds: chunk.documentIds }),
          }),
      })
      // Uma fatia que falhou não desfaz as que gravaram: os caches são refeitos de qualquer jeito.
      forgetLinkedViews()
      const failure = firstErrorCode(results)
      if (failure !== null) throw new Error(failure === '' ? REQUEST_FAILED_CODE : failure)

      return results.at(-1)?.value ?? batch
    },
    onError: (error) => {
      if (shouldRefreshPreviewAfterFailure(readErrorCode(error))) forgetPreviews()
    },
    onSuccess: (batch) => {
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
    setCreateProgressEvent(IDLE_PROGRESS)
    setPreviewProgressEvent(IDLE_PROGRESS)
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

  const rows = summary?.rows ?? []

  return {
    blockGroups: preview === null ? [] : groupBlocksByReason(preview.blocked),
    canConfirm: canConfirmEmission({ preview, status }),
    canEmit,
    canManageProfiles: canReachCteProfiles(permissions),
    chunkCount: chunks.length,
    close,
    confirm,
    createdBatch,
    createProgress: resolveEmissionProgress(createProgressEvent),
    errorCode: readErrorCode(previewQuery.error ?? createMutation.error),
    groupingMode,
    hiddenRowCount: Math.max(0, rows.length - CTE_EMISSION_MAX_VISIBLE_ROWS),
    isFormLocked: isEmissionFormLocked(status),
    isOpen,
    name,
    open,
    openProfileSettings,
    preview,
    previewProgress: resolveEmissionProgress(previewProgressEvent),
    profileId,
    profileOptions: (profiles.profilesQuery.data?.items ?? []).map((profile) => ({
      id: profile.id,
      name: profile.name,
      percentage: profile.freightRule.percentage,
    })),
    selectedCount: input.documentIds.length,
    setGroupingMode,
    setName: setCustomName,
    setProfileId,
    status,
    summary,
    // Dezenas de milhares de linhas no DOM travam a janela; o restante vira contagem no rodapé.
    visibleRows: rows.slice(0, CTE_EMISSION_MAX_VISIBLE_ROWS),
  }
}
