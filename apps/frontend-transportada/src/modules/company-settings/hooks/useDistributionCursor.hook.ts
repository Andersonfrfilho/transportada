/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createCompanySettingsClient,
  type DistributionCursor,
} from '../shared/companySettingsClient.service'

const DISTRIBUTION_CURSOR_QUERY_KEY = 'company-distribution-cursor'

export type DistributionCursorController = Readonly<{
  adjust: (ultNsu: string) => Promise<DistributionCursor>
  read: () => Promise<DistributionCursor>
}>

function createClient() {
  return createCompanySettingsClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: () => crypto.randomUUID(),
  })
}

export function createDistributionCursorController(
  client: ReturnType<typeof createCompanySettingsClient>,
): DistributionCursorController {
  return {
    adjust: (ultNsu) => client.adjustDistributionCursor(ultNsu),
    read: () => client.getDistributionCursor(),
  }
}

export function useDistributionCursor(input: Readonly<{ companyId?: string; enabled: boolean }>) {
  const queryClient = useQueryClient()
  const controller = createDistributionCursorController(createClient())
  const queryKey = [DISTRIBUTION_CURSOR_QUERY_KEY, input.companyId] as const
  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: controller.read,
    queryKey,
  })
  const adjustMutation = useMutation({
    mutationFn: (ultNsu: string) => controller.adjust(ultNsu),
    onSuccess(cursor) {
      queryClient.setQueryData(queryKey, cursor)
    },
  })
  return { adjustMutation, query }
}
