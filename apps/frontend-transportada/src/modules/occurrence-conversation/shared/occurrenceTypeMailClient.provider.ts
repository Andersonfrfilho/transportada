/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createOccurrenceTypeMailClient,
  type OccurrenceTypeMailClient,
} from './occurrenceTypeMailClient.service'

/** Spec 271: o cliente ligado ao ambiente e ao token; os testes trocam este módulo. */
export function getOccurrenceTypeMailClient(): OccurrenceTypeMailClient {
  return createOccurrenceTypeMailClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
