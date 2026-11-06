/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  createAccessKeyLookupClient,
  type AccessKeyLookupClient,
} from '../shared/accessKeyLookupClient.service'

/** A busca faz polling e agrupa leituras, então o cache do TanStack não serve: o cliente é o ponto de entrada. */
export function getAccessKeyLookupClient(): AccessKeyLookupClient {
  return createAccessKeyLookupClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request, init) => fetch(request, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
