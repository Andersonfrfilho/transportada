/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { MunicipalRuleChanges, MunicipalRuleFields } from '../shared/businessCalendar.types'
import { getBusinessCalendarClient } from '../shared/businessCalendarClient.provider'
import {
  BUSINESS_CALENDAR_RESOURCE,
  invalidateBusinessCalendar,
} from '../queries/useBusinessCalendar.query'

type CompanyScope = Readonly<{ companyId: string | undefined }>

/** A regra gera, edita ou apaga as datas dela: as duas leituras do município mudam juntas. */
const RULE_RESOURCES = [
  BUSINESS_CALENDAR_RESOURCE.MUNICIPAL_RULES,
  BUSINESS_CALENDAR_RESOURCE.MUNICIPAL_HOLIDAYS,
] as const

function useRuleInvalidation(input: CompanyScope): () => Promise<void> {
  const queryClient = useQueryClient()
  return () =>
    invalidateBusinessCalendar({
      companyId: input.companyId,
      queryClient,
      resources: RULE_RESOURCES,
    })
}

export function useCreateRuleMutation(input: CompanyScope) {
  const invalidate = useRuleInvalidation(input)
  return useMutation({
    mutationFn: (fields: MunicipalRuleFields) => getBusinessCalendarClient().createRule(fields),
    onSuccess: invalidate,
  })
}

export function useUpdateRuleMutation(input: CompanyScope) {
  const invalidate = useRuleInvalidation(input)
  return useMutation({
    mutationFn: (update: Readonly<{ changes: MunicipalRuleChanges; id: string }>) =>
      getBusinessCalendarClient().updateRule(update),
    onSuccess: invalidate,
  })
}

export function useDeleteRuleMutation(input: CompanyScope) {
  const invalidate = useRuleInvalidation(input)
  return useMutation({
    mutationFn: (id: string) => getBusinessCalendarClient().deleteRule(id),
    onSuccess: invalidate,
  })
}

export function useMaterializeRulesMutation(input: CompanyScope) {
  const invalidate = useRuleInvalidation(input)
  return useMutation({
    mutationFn: () => getBusinessCalendarClient().materialize(),
    onSuccess: invalidate,
  })
}
