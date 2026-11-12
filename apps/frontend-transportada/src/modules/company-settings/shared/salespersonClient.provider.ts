/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import { createSalespersonClient, type SalespersonClient } from './salespersonClient.service'

/** Spec 316: o cliente ligado ao ambiente e ao token; os testes trocam este módulo. */
export function getSalespersonClient(): SalespersonClient {
  return createSalespersonClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
