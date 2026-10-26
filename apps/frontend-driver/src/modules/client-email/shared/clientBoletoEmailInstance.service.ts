/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getDriverConversationOwner } from '@/modules/conversation/shared/driverConversationsApiInstance.service'
import { createDriverConversationHttp } from '@/modules/conversation/shared/driverConversationsHttp.service'
import { getDriverEnvironment } from '@/modules/shared/environment.config'
import { getKeycloakAuthProvider } from '@/modules/shared/KeycloakAuthProvider.provider'

import {
  createClientBoletoEmailApi,
  type ClientBoletoEmailApi,
} from './clientBoletoEmailApi.service'
import {
  createClientBoletoEmailOutbox,
  type ClientBoletoEmailOutbox,
} from './clientBoletoEmailOutbox.service'
import { createIndexedDbClientBoletoEmailOutboxStore } from './clientBoletoEmailOutboxStore.service'

type ClientBoletoEmailRuntime = Readonly<{
  api: ClientBoletoEmailApi
  outbox: ClientBoletoEmailOutbox
}>

let runtime: ClientBoletoEmailRuntime | undefined

/** Nasce uma vez: a fila e o adapter dividem o mesmo `http`, com o token buscado a cada chamada. */
export function getClientBoletoEmailRuntime(): ClientBoletoEmailRuntime {
  if (runtime === undefined) {
    const api = createClientBoletoEmailApi(
      createDriverConversationHttp({
        baseUrl: getDriverEnvironment().apiBaseUrl,
        fetch: (request) => fetch(request),
        getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
      }),
    )
    runtime = {
      api,
      outbox: createClientBoletoEmailOutbox({
        getOwnerKey: getDriverConversationOwner,
        send: api.send,
        store: createIndexedDbClientBoletoEmailOutboxStore(),
      }),
    }
  }
  return runtime
}
