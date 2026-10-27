/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createDriverConversationHttp } from '@/modules/conversation/shared/driverConversationsHttp.service'
import { getDriverEnvironment } from '@/modules/shared/environment.config'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import { createClientContactsApi, type ClientContactsApi } from './clientContactsApi.service'

let api: ClientContactsApi | undefined

/** Nasce uma vez; o token é buscado a cada chamada pelo `http`. */
export function getClientContactsApi(): ClientContactsApi {
  api ??= createClientContactsApi(
    createDriverConversationHttp({
      baseUrl: getDriverEnvironment().apiBaseUrl,
      fetch: (request) => fetch(request),
      getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    }),
  )
  return api
}
