/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useMaterializeRulesMutation } from '../mutations/useMunicipalRules.mutation'
import type { MaterializationSummary } from '../shared/businessCalendar.types'
import { describeBusinessCalendarRefusal } from '../shared/businessCalendarRefusal.service'
import type { BusinessCalendarRefusal } from '../shared/businessCalendarRefusal.service'

/**
 * "Gerar próximos anos" (ADR-0096 §6): idempotente, sem corpo, e a única forma de o horizonte avançar — não há
 * rotina agendada. O botão trava enquanto gera; o resultado e a falha são ditos, nunca mudos.
 */
export function useMaterialization(input: Readonly<{ companyId: string | undefined }>) {
  const mutation = useMaterializeRulesMutation({ companyId: input.companyId })
  const [summary, setSummary] = useState<MaterializationSummary | undefined>(undefined)
  const [refusal, setRefusal] = useState<BusinessCalendarRefusal | undefined>(undefined)

  async function run(): Promise<void> {
    if (mutation.isPending) return
    setSummary(undefined)
    setRefusal(undefined)
    try {
      setSummary(await mutation.mutateAsync())
    } catch (error) {
      setRefusal(describeBusinessCalendarRefusal(error))
    }
  }

  return { isRunning: mutation.isPending, refusal, run, summary }
}

export type MaterializationController = ReturnType<typeof useMaterialization>
