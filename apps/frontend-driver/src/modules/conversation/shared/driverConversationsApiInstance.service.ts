/* Copyright (c) 2026 Ada Technology. MIT License. */
import i18n from 'i18next'

import { getDriverEnvironment } from '@/modules/shared/environment.config'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import type { ClientMessageIdEchoStorage } from './clientMessageIdEcho.service'
import { createConversationOutbox } from './conversationOutbox.service'
import { createIndexedDbOutboxStore } from './conversationOutboxStore.service'
import {
  createDriverConversationsApi,
  type DriverConversationsApi,
} from './driverConversationsApi.service'
import { createDriverConversationHttp } from './driverConversationsHttp.service'

let driverConversationsApi: DriverConversationsApi | undefined
let outboxOwnerKey: string | undefined

function readSessionStorage(): ClientMessageIdEchoStorage | undefined {
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}

/** Quem é o dono da fila offline: o `subHash` da sessão, dado pelo boot antes de a casca montar. */
export function setDriverConversationOwner(ownerKey: string | undefined): void {
  outboxOwnerKey = ownerKey
}

/** O adapter nasce uma vez: `api` com identidade nova a cada render recarregaria a lista. */
export function getDriverConversationsApi(): DriverConversationsApi {
  driverConversationsApi ??= createDriverConversationsApi({
    echoStorage: readSessionStorage(),
    fallbackSubjectLabel: () => i18n.t('subjectFallback', { ns: 'conversation' }),
    http: createDriverConversationHttp({
      baseUrl: `${getDriverEnvironment().apiBaseUrl}/v1`,
      fetch: (request) => fetch(request),
      getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    }),
    outbox: createConversationOutbox({
      getOwnerKey: () => outboxOwnerKey,
      store: createIndexedDbOutboxStore(),
    }),
  })
  return driverConversationsApi
}

/** Gancho para quem sabe que chegou mensagem (sino em tempo real): busca já, sem esperar o próximo ciclo. */
export function requestConversationRefresh(): void {
  driverConversationsApi?.requestRefresh()
}
