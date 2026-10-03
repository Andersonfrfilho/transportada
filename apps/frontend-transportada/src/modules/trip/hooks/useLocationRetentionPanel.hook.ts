/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import {
  useClearLocationRetentionMutation,
  useLocationRetentionImpactQuery,
  useLocationRetentionQuery,
  useSaveLocationRetentionMutation,
} from '../queries/useLocationRetention.query'
import { LOCATION_RETENTION_DAYS_RANGE } from '../shared/locationRetention.constant'
import {
  parseLocationRetentionDays,
  resolveLocationRetentionConfirmation,
  resolveLocationRetentionStatus,
  summarizeLocationRetentionImpact,
  type LocationRetentionConfirmation,
} from '../shared/locationRetention.service'
import type { LocationRetentionDraft } from '../shared/locationRetention.validation'

type PendingChange = Readonly<{
  confirmation: LocationRetentionConfirmation
  draft: LocationRetentionDraft
}>

/**
 * Spec 239 T3.2: tudo que o painel decide mora aqui. O painel só lê `canManage` e `isEnabled`
 * (aba aberta): sem permissão a consulta nem sobe, e a tela não pede o que não pode ver.
 */
export function useLocationRetentionPanel(
  input: Readonly<{ canManage: boolean; isEnabled: boolean }>,
) {
  const query = useLocationRetentionQuery({ enabled: input.canManage && input.isEnabled })
  const saveMutation = useSaveLocationRetentionMutation()
  const clearMutation = useClearLocationRetentionMutation()
  const [typedDays, setTypedDays] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState<PendingChange | undefined>(undefined)
  const impactQuery = useLocationRetentionImpactQuery({
    enabled: pending !== undefined,
    retentionDays: pending?.draft.retentionDays ?? LOCATION_RETENTION_DAYS_RANGE.max,
  })

  const settings = query.data
  const daysText = typedDays ?? String(settings?.retentionDays ?? '')
  const parsedDays = parseLocationRetentionDays(daysText)
  const status =
    settings === undefined
      ? undefined
      : resolveLocationRetentionStatus({ nowMs: Date.now(), settings })
  const isSaving = saveMutation.isPending || clearMutation.isPending
  const hasDaysChange =
    settings !== undefined && parsedDays !== undefined && parsedDays !== settings.retentionDays
  const impactSummary =
    impactQuery.data === undefined ? undefined : summarizeLocationRetentionImpact(impactQuery.data)

  function save(draft: LocationRetentionDraft): void {
    saveMutation.mutate(draft, { onSuccess: () => setTypedDays(undefined) })
  }

  function submit(draft: LocationRetentionDraft): void {
    if (settings === undefined) return
    const confirmation = resolveLocationRetentionConfirmation({ next: draft, stored: settings })
    if (confirmation === undefined) {
      save(draft)
      return
    }
    setPending({ confirmation, draft })
  }

  function handleToggle(): void {
    if (settings === undefined) return
    const retentionDays = parsedDays ?? (settings.purgeEnabled ? settings.retentionDays : undefined)
    if (retentionDays === undefined) return
    submit({ purgeEnabled: !settings.purgeEnabled, retentionDays })
  }

  function handleSaveDays(): void {
    if (settings === undefined || parsedDays === undefined) return
    submit({ purgeEnabled: settings.purgeEnabled, retentionDays: parsedDays })
  }

  function handleConfirm(): void {
    if (pending === undefined) return
    saveMutation.mutate(pending.draft, {
      onSettled: () => setPending(undefined),
      onSuccess: () => setTypedDays(undefined),
    })
  }

  function handleClear(): void {
    clearMutation.mutate(undefined, { onSuccess: () => setTypedDays(undefined) })
  }

  return {
    clearMutation,
    daysText,
    handleCancel: () => setPending(undefined),
    handleClear,
    handleConfirm,
    handleDaysChange: setTypedDays,
    handleSaveDays,
    handleToggle,
    hasDaysChange,
    impact: { isError: impactQuery.isError, summary: impactSummary },
    isDaysInvalid: parsedDays === undefined,
    isSaving,
    pending,
    query,
    saveMutation,
    settings,
    status,
  }
}
