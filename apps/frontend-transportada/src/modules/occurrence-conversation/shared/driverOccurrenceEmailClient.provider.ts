/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createDriverOccurrenceEmailClient,
  type DriverOccurrenceEmailClient,
} from './driverOccurrenceEmailClient.service'

/** Spec 322: o cliente ligado ao ambiente e ao token; os testes trocam este módulo. */
export function getDriverOccurrenceEmailClient(): DriverOccurrenceEmailClient {
  return createDriverOccurrenceEmailClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
