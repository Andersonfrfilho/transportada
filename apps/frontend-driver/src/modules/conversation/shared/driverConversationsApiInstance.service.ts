/* Copyright (c) 2026 Ada Technology. MIT License. */
import i18n from 'i18next'

import { getDriverEnvironment } from '@/modules/shared/environment.config'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import { createConversationOutbox } from './conversationOutbox.service'
import { createIndexedDbOutboxStore } from './conversationOutboxStore.service'
import {
  createDriverConversationsApi,
  type DriverConversationsApi,
} from './driverConversationsApi.service'
import { createDriverConversationHttp } from './driverConversationsHttp.service'
import { createDriverQuickReplies } from './driverQuickReplies.service'

let driverConversationsApi: DriverConversationsApi | undefined
let driverQuickReplies: ReturnType<typeof createDriverQuickReplies> | undefined
let outboxOwnerKey: string | undefined

/** Quem é o dono da fila offline: o `subHash` da sessão, dado pelo boot antes de a casca montar. */
export function setDriverConversationOwner(ownerKey: string | undefined): void {
  outboxOwnerKey = ownerKey
}

export function getDriverConversationOwner(): string | undefined {
  return outboxOwnerKey
}

function createBrowserHttp() {
  return createDriverConversationHttp({
    baseUrl: `${getDriverEnvironment().apiBaseUrl}/v1`,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

function resolveBrowserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** As respostas prontas da empresa, com a última lista boa guardada para a rua sem sinal. */
export function getDriverQuickReplies(): ReturnType<typeof createDriverQuickReplies> {
  driverQuickReplies ??= createDriverQuickReplies({
    getOwnerKey: getDriverConversationOwner,
    http: createBrowserHttp(),
    storage: resolveBrowserStorage(),
  })
  return driverQuickReplies
}

/** O adapter nasce uma vez: `api` com identidade nova a cada render recarregaria a lista. */
export function getDriverConversationsApi(): DriverConversationsApi {
  driverConversationsApi ??= createDriverConversationsApi({
    fallbackSubjectLabel: () => i18n.t('subjectFallback', { ns: 'conversation' }),
    http: createBrowserHttp(),
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
