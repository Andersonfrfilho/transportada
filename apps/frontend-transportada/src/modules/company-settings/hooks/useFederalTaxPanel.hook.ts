/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createFederalTaxClient } from '../shared/federalTaxClient.service'
import type { FederalTaxSubmission } from '../shared/federalTaxSuggestion.service'

const FEDERAL_TAX_QUERY_KEY = 'company-federal-taxes'

function getFederalTaxClient() {
  return createFederalTaxClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/** Spec 126: liga a consulta só com a aba Tributos aberta — o registro de abas diz onde o painel mora. */
export function useFederalTaxPanel(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const client = getFederalTaxClient()
  const queryClient = useQueryClient()
  const queryKey = [FEDERAL_TAX_QUERY_KEY, input.companyId] as const

  const query = useQuery({ enabled: input.enabled, queryFn: client.get, queryKey })
  const saveMutation = useMutation({
    mutationFn: (submission: FederalTaxSubmission) => client.save(submission),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const clearMutation = useMutation({
    mutationFn: () => client.clear(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  return { clearMutation, query, saveMutation }
}
