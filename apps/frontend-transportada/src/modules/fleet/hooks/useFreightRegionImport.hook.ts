/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { resolveFleetFeedbackKey } from '../shared/fleetFeedback.service'
import type { FreightRegionImportSummary } from '../shared/freightRegion.types'
import {
  EMPTY_FREIGHT_REGION_IMPORT_DRAFT,
  buildFreightRegionImportSubmission,
} from '../shared/freightRegionImport.service'
import type {
  FreightRegionImportBlockReason,
  FreightRegionImportDraft,
} from '../shared/freightRegionImport.service'
import { getFleetClient } from './useFleet.hook'
import { FREIGHT_REGIONS_QUERY_KEY } from './useFreightRegions.hook'

type UseFreightRegionImportInput = Readonly<{ companyId: string | undefined }>

export type FreightRegionImportController = Readonly<{
  blockReason: null | FreightRegionImportBlockReason
  draft: FreightRegionImportDraft
  feedbackKey: null | string
  isSaving: boolean
  pickRates: (file: File) => Promise<void>
  pickRegions: (file: File) => Promise<void>
  submit: () => Promise<void>
  summary: null | FreightRegionImportSummary
}>

export function useFreightRegionImport(
  input: UseFreightRegionImportInput,
): FreightRegionImportController {
  const client = getFleetClient()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<FreightRegionImportDraft>(EMPTY_FREIGHT_REGION_IMPORT_DRAFT)
  const [blockReason, setBlockReason] = useState<null | FreightRegionImportBlockReason>(null)
  const [feedbackKey, setFeedbackKey] = useState<null | string>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [summary, setSummary] = useState<null | FreightRegionImportSummary>(null)

  function patch(values: Partial<FreightRegionImportDraft>): void {
    setBlockReason(null)
    setFeedbackKey(null)
    setSummary(null)
    setDraft((previous) => ({ ...previous, ...values }))
  }

  async function pickRegions(file: File): Promise<void> {
    patch({ regions: await file.text(), regionsName: file.name })
  }

  async function pickRates(file: File): Promise<void> {
    patch({ rates: await file.text(), ratesName: file.name })
  }

  async function submit(): Promise<void> {
    const submission = buildFreightRegionImportSubmission(draft)
    if (submission.status === 'blocked') {
      setBlockReason(submission.reason)
      return
    }

    setBlockReason(null)
    setFeedbackKey(null)
    setIsSaving(true)
    try {
      setSummary(await client.importFreightRegions(submission.body))
      // A importação reescreve rota, valor e cidade de uma vez: a tabela inteira é releitura
      void queryClient.invalidateQueries({ queryKey: [FREIGHT_REGIONS_QUERY_KEY, input.companyId] })
    } catch (error) {
      setFeedbackKey(resolveFleetFeedbackKey(error))
    } finally {
      setIsSaving(false)
    }
  }

  return { blockReason, draft, feedbackKey, isSaving, pickRates, pickRegions, submit, summary }
}
