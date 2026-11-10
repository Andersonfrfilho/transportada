/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createFieldReportHoldsClient,
  type FieldReportHoldDecision,
} from '../shared/fieldReportHoldsClient.service'

const FIELD_REPORT_HOLDS_QUERY_KEY = 'field-report-holds'
const RESOLVE_PERMISSION = 'occurrences.resolve'

export function useFieldReportHolds(
  input: Readonly<{ companyId?: string; permissions: readonly string[] }>,
) {
  const canDecide = input.companyId !== undefined && input.permissions.includes(RESOLVE_PERMISSION)
  const client = createFieldReportHoldsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
  const queryKey = [FIELD_REPORT_HOLDS_QUERY_KEY, input.companyId]
  const queryClient = useQueryClient()
  const listQuery = useQuery({ enabled: canDecide, queryFn: () => client.list(), queryKey })
  const decisionMutation = useMutation({
    mutationFn: (decision: { decision: FieldReportHoldDecision; id: string }) =>
      client.decide(decision),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { canDecide, decisionMutation, holds: listQuery.data ?? [], listQuery }
}
