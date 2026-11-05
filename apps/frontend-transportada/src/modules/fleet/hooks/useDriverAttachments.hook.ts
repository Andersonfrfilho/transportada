/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createDriverAttachmentClient,
  type DriverAttachmentClient,
} from '../shared/driverAttachmentClient.service'

const DRIVER_ATTACHMENTS_QUERY_KEY = 'fleet-driver-attachments'

function createClient() {
  return createDriverAttachmentClient({
    apiBaseUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

/** Spec 091: os documentos anexados à ficha do motorista (só a lista; o conteúdo é `fleet.reveal`). */
export function useDriverAttachments(
  input: Readonly<{ client?: DriverAttachmentClient; driverId: string }>,
) {
  const client = input.client ?? createClient()
  const listQuery = useQuery({
    queryFn: () => client.list(input.driverId),
    queryKey: [DRIVER_ATTACHMENTS_QUERY_KEY, input.driverId] as const,
  })

  return { listQuery }
}
