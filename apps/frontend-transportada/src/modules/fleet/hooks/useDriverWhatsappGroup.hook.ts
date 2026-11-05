/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createDriverWhatsappGroupClient,
  type DriverWhatsappGroupClient,
} from '../shared/driverWhatsappGroupClient.service'

const DRIVER_WHATSAPP_GROUP_QUERY_KEY = 'fleet-driver-whatsapp-group'
const WHATSAPP_GROUPS_QUERY_KEY = 'fleet-whatsapp-groups'

function createClient() {
  return createDriverWhatsappGroupClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/**
 * Spec 292 T1: o grupo da ficha, trocar e desvincular. A lista de grupos do Evolution só é pedida
 * (`groupsEnabled`) quando o operador abre a escolha: ela vai ao WhatsApp e pode demorar.
 */
export function useDriverWhatsappGroup(
  input: Readonly<{
    client?: DriverWhatsappGroupClient
    driverId: string
    groupsEnabled: boolean
  }>,
) {
  const queryClient = useQueryClient()
  const client = input.client ?? createClient()
  const groupKey = [DRIVER_WHATSAPP_GROUP_QUERY_KEY, input.driverId] as const
  const groupQuery = useQuery({
    queryFn: () => client.get(input.driverId),
    queryKey: groupKey,
  })
  const groupsQuery = useQuery({
    enabled: input.groupsEnabled,
    gcTime: 0,
    queryFn: client.listGroups,
    queryKey: [WHATSAPP_GROUPS_QUERY_KEY],
  })
  const setMutation = useMutation({
    mutationFn: (value: Readonly<{ groupJid: string; groupName: string }>) =>
      client.set({ driverId: input.driverId, ...value }),
    onSuccess(group) {
      queryClient.setQueryData(groupKey, group)
      void queryClient.invalidateQueries({ queryKey: [WHATSAPP_GROUPS_QUERY_KEY] })
    },
  })
  const removeMutation = useMutation({
    mutationFn: () => client.remove(input.driverId),
    onSuccess() {
      queryClient.setQueryData(groupKey, null)
      void queryClient.invalidateQueries({ queryKey: [WHATSAPP_GROUPS_QUERY_KEY] })
    },
  })

  return { groupQuery, groupsQuery, removeMutation, setMutation }
}
