/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { getExtraChargesClient } from '../shared/extraChargesClient.service'
import type {
  Contractor,
  ExtraChargeBatch,
  OccurrenceChargeReportFilters,
  OccurrenceChargeReportPage,
} from '../shared/extraCharges.types'
import {
  resolveSelectionPeriod,
  toggleReimbursementRow,
  type SelectionPeriod,
} from '../shared/occurrenceReimbursementSelection.service'

const OCCURRENCE_REPORT_QUERY_KEY = 'occurrence-charge-report'
const REPORT_PAGE_LIMIT = 100
const FINANCIALS_PERMISSION = 'trip.financials'

export type OccurrenceReimbursementsController = Readonly<{
  canView: boolean
  closeSelection: () => Promise<void>
  closedBatch: ExtraChargeBatch | undefined
  contractors: readonly Contractor[]
  downloadStatement: () => Promise<void>
  filters: OccurrenceChargeReportFilters
  isClosing: boolean
  isDownloading: boolean
  isLoading: boolean
  lastError: string | null
  report: OccurrenceChargeReportPage | undefined
  selectedIds: ReadonlySet<string>
  selectionPeriod: ReturnType<typeof resolveSelectionPeriod> | undefined
  setFilters: (filters: OccurrenceChargeReportFilters) => void
  toggleRow: (rowId: string) => void
}>

/**
 * Spec 164 T26 (RF32): "Ressarcimentos" — relatório de cobranças de ocorrência sem lote, seleção
 * por linha, e o fechamento existente (`POST /extra-charge-batches`) recebendo `chargeIds` com
 * exatamente as linhas marcadas. `periodStart`/`periodEnd` seguem enviados como o intervalo que
 * a seleção cobre (`resolveSelectionPeriod`).
 */
export function useOccurrenceReimbursements(
  input: Readonly<{ permissions: readonly string[] }>,
): OccurrenceReimbursementsController {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<OccurrenceChargeReportFilters>({})
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [closedBatch, setClosedBatch] = useState<ExtraChargeBatch | undefined>(undefined)
  const [lastError, setLastError] = useState<string | null>(null)
  const canView = input.permissions.includes(FINANCIALS_PERMISSION)

  const report = useQuery({
    enabled: canView,
    queryFn: () =>
      getExtraChargesClient().readOccurrenceChargeReport({ ...filters, limit: REPORT_PAGE_LIMIT }),
    queryKey: [OCCURRENCE_REPORT_QUERY_KEY, filters],
  })
  const contractors = useQuery({
    enabled: canView,
    queryFn: () => getExtraChargesClient().listContractors(),
    queryKey: [OCCURRENCE_REPORT_QUERY_KEY, 'contractors'],
  })

  const close = useMutation({
    mutationFn: (period: SelectionPeriod) => getExtraChargesClient().closeBatch(period),
    onSuccess: (batch) => {
      setClosedBatch(batch)
      setSelectedIds(new Set())
      void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_REPORT_QUERY_KEY] })
    },
  })
  const download = useMutation({
    mutationFn: (batchId: string) => getExtraChargesClient().downloadStatement(batchId),
    onSuccess: (file) => {
      const url = URL.createObjectURL(file.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.fileName
      link.click()
      URL.revokeObjectURL(url)
    },
  })

  async function guard(operation: () => Promise<unknown>): Promise<void> {
    setLastError(null)
    try {
      await operation()
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'REQUEST_FAILED')
    }
  }

  const rows = report.data?.items ?? []
  const selectionPeriod = rows.length === 0 ? undefined : resolveSelectionPeriod(rows, selectedIds)

  return {
    canView,
    closedBatch,
    closeSelection: () =>
      guard(async () => {
        if (selectionPeriod === undefined || typeof selectionPeriod === 'string') return
        await close.mutateAsync(selectionPeriod)
      }),
    contractors: contractors.data ?? [],
    downloadStatement: () =>
      guard(async () => {
        if (closedBatch === undefined) return
        await download.mutateAsync(closedBatch.id)
      }),
    filters,
    isClosing: close.isPending,
    isDownloading: download.isPending,
    isLoading: report.isLoading,
    lastError,
    report: report.data,
    selectedIds,
    selectionPeriod,
    setFilters: (nextFilters) => {
      setFilters(nextFilters)
      setSelectedIds(new Set())
    },
    toggleRow: (rowId) => setSelectedIds((current) => toggleReimbursementRow(current, rowId)),
  }
}
