/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createCompanySettingsClient,
  type ScheduledDistributionStatus,
} from '../shared/companySettingsClient.service'

const SCHEDULED_DISTRIBUTION_QUERY_KEY = 'company-scheduled-distribution'

export type ScheduledDistributionController = Readonly<{
  disable: () => Promise<ScheduledDistributionStatus>
  enable: () => Promise<ScheduledDistributionStatus>
  read: () => Promise<ScheduledDistributionStatus>
}>

function createClient() {
  return createCompanySettingsClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    newIdempotencyKey: () => crypto.randomUUID(),
  })
}

export function createScheduledDistributionController(
  client: ReturnType<typeof createCompanySettingsClient>,
): ScheduledDistributionController {
  return {
    disable: () => client.disableScheduledDistribution(),
    enable: () => client.enableScheduledDistribution(),
    read: () => client.getScheduledDistribution(),
  }
}

export function useScheduledDistribution(
  input: Readonly<{ companyId?: string; enabled: boolean }>,
) {
  const queryClient = useQueryClient()
  const controller = createScheduledDistributionController(createClient())
  const queryKey = [SCHEDULED_DISTRIBUTION_QUERY_KEY, input.companyId] as const
  const query = useQuery({
    enabled: input.enabled && input.companyId !== undefined,
    queryFn: controller.read,
    queryKey,
  })
  const toggleMutation = useMutation({
    mutationFn: (nextEnabled: boolean) =>
      nextEnabled ? controller.enable() : controller.disable(),
    onSuccess(status) {
      queryClient.setQueryData(queryKey, status)
    },
  })
  return { query, toggleMutation }
}
