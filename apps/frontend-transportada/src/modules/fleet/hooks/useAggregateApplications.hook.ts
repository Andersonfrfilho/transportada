/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createAggregateApplicationClient } from '../shared/aggregateApplicationClient.service'

const AGGREGATE_APPLICATIONS_QUERY_KEY = 'aggregate-applications'
/**
 * Mesma chave que `useFleet.hook.ts` usa para a lista de motoristas — aprovar cria uma ficha nova,
 * e sem invalidar aqui a aba Frota só mostraria o motorista novo depois de um F5. As duas chaves
 * pertencem a este módulo (`fleet`), então o registro de efeito entre módulos não se aplica — ver
 * `docs/frontend/mutations.md`.
 */
const FLEET_DRIVERS_QUERY_KEY = 'fleet-drivers'

function getAggregateApplicationClient() {
  return createAggregateApplicationClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

export function useAggregateApplications(
  input: Readonly<{ companyId?: string; enabled: boolean }>,
) {
  const client = getAggregateApplicationClient()
  const queryClient = useQueryClient()
  const queryKey = [AGGREGATE_APPLICATIONS_QUERY_KEY, input.companyId] as const

  const query = useQuery({
    enabled: input.enabled,
    queryFn: client.list,
    queryKey,
  })

  function invalidate(): Promise<void> {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: [AGGREGATE_APPLICATIONS_QUERY_KEY] }),
      queryClient.invalidateQueries({ queryKey: [FLEET_DRIVERS_QUERY_KEY] }),
    ]).then(() => undefined)
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) => client.approve(id),
    onSuccess: invalidate,
  })
  const rejectMutation = useMutation({
    mutationFn: (input: Readonly<{ id: string; rejectionReason: string }>) => client.reject(input),
    onSuccess: invalidate,
  })

  return { approveMutation, query, rejectMutation }
}
