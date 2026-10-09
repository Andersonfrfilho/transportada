/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantConversationsApi } from '@adatechnology/conversations-ui/participant'
import i18n from 'i18next'

import { getDriverEnvironment } from '@/modules/shared/environment.config'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import type { ClientMessageIdEchoStorage } from './clientMessageIdEcho.service'
import { createDriverConversationsApi } from './driverConversationsApi.service'
import { createDriverConversationHttp } from './driverConversationsHttp.service'

let driverConversationsApi: ParticipantConversationsApi | undefined

function readSessionStorage(): ClientMessageIdEchoStorage | undefined {
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}

/** O adapter nasce uma vez: `api` com identidade nova a cada render recarregaria a lista. */
export function getDriverConversationsApi(): ParticipantConversationsApi {
  driverConversationsApi ??= createDriverConversationsApi({
    echoStorage: readSessionStorage(),
    fallbackSubjectLabel: () => i18n.t('subjectFallback', { ns: 'conversation' }),
    http: createDriverConversationHttp({
      baseUrl: `${getDriverEnvironment().apiBaseUrl}/v1`,
      fetch: (request) => fetch(request),
      getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    }),
  })
  return driverConversationsApi
}
