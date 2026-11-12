/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getDriverConversationOwner } from '@/modules/conversation/shared/driverConversationsApiInstance.service'
import { createDriverConversationHttp } from '@/modules/conversation/shared/driverConversationsHttp.service'
import { getDriverEnvironment } from '@/modules/shared/environment.config'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import {
  createClientBoletoWhatsAppApi,
  type ClientBoletoWhatsAppApi,
} from './clientBoletoWhatsAppApi.service'
import {
  createClientBoletoWhatsAppOutbox,
  type ClientBoletoWhatsAppOutbox,
} from './clientBoletoWhatsAppOutbox.service'
import { createIndexedDbClientBoletoWhatsAppOutboxStore } from './clientBoletoWhatsAppOutboxStore.service'

type ClientBoletoWhatsAppRuntime = Readonly<{
  api: ClientBoletoWhatsAppApi
  outbox: ClientBoletoWhatsAppOutbox
}>

let runtime: ClientBoletoWhatsAppRuntime | undefined

/** Nasce uma vez: a fila e o adapter dividem o mesmo `http`, com o token buscado a cada chamada. */
export function getClientBoletoWhatsAppRuntime(): ClientBoletoWhatsAppRuntime {
  if (runtime === undefined) {
    const api = createClientBoletoWhatsAppApi(
      createDriverConversationHttp({
        baseUrl: getDriverEnvironment().apiBaseUrl,
        fetch: (request) => fetch(request),
        getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
      }),
    )
    runtime = {
      api,
      outbox: createClientBoletoWhatsAppOutbox({
        getOwnerKey: getDriverConversationOwner,
        send: api.send,
        store: createIndexedDbClientBoletoWhatsAppOutboxStore(),
      }),
    }
  }
  return runtime
}
