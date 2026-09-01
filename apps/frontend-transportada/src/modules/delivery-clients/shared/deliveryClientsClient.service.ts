/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  DELIVERY_CLIENTS_ERROR,
  DELIVERY_CLIENTS_PATH,
  type DeliveryClientDetail,
  type DeliveryClientFilters,
  type DeliveryClientPage,
  type DeliveryClientWrite,
  type DeliveryException,
  type DeliveryWindow,
} from './deliveryClients.types'
import {
  toDeliveryClientDetail,
  toDeliveryClientPage,
  toDeliveryExceptions,
  toDeliveryWindows,
} from './deliveryClientsResponse.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type DeliveryClientsClient = Readonly<{
  getClient: (id: string) => Promise<DeliveryClientDetail>
  listClients: (
    input: Readonly<{ cursor: null | string; filters: DeliveryClientFilters; limit: number }>,
  ) => Promise<DeliveryClientPage>
  replaceExceptions: (
    input: Readonly<{ exceptions: readonly DeliveryException[]; id: string }>,
  ) => Promise<readonly DeliveryException[]>
  replaceWindows: (
    input: Readonly<{ id: string; windows: readonly DeliveryWindow[] }>,
  ) => Promise<readonly DeliveryWindow[]>
  updateClient: (
    input: Readonly<{ id: string; values: DeliveryClientWrite }>,
  ) => Promise<DeliveryClientDetail>
}>

/**
 * Spec 060 D1: o cadastro **já existe** quando alguém abre esta tela — ele nasceu da nota. Por isso
 * não há `create` aqui: a tela preenche regra (hora, taxa, agendamento), não cria cliente.
 */
export function createDeliveryClientsClient(
  dependencies: ClientDependencies,
): DeliveryClientsClient {
  return {
    async getClient(id) {
      return toDeliveryClientDetail(
        await request({ dependencies, method: 'GET', path: `${DELIVERY_CLIENTS_PATH}/${id}` }),
      )
    },
    async listClients({ cursor, filters, limit }) {
      const parameters = new URLSearchParams({ limit: String(limit) })
      if (cursor !== null) parameters.set('cursor', cursor)
      if (filters.nameContains.trim().length > 0) {
        parameters.set('nameContains', filters.nameContains.trim())
      }
      if (filters.status !== null) parameters.set('status', filters.status)
      if (filters.requiresScheduling !== null) {
        parameters.set('requiresScheduling', String(filters.requiresScheduling))
      }

      return toDeliveryClientPage(
        await request({
          dependencies,
          method: 'GET',
          path: `${DELIVERY_CLIENTS_PATH}?${parameters.toString()}`,
        }),
      )
    },
    async replaceExceptions({ exceptions, id }) {
      return toDeliveryExceptions(
        await request({
          body: JSON.stringify({ exceptions }),
          dependencies,
          method: 'PUT',
          path: `${DELIVERY_CLIENTS_PATH}/${id}/exceptions`,
        }),
      )
    },
    async replaceWindows({ id, windows }) {
      return toDeliveryWindows(
        await request({
          body: JSON.stringify({ windows }),
          dependencies,
          method: 'PUT',
          path: `${DELIVERY_CLIENTS_PATH}/${id}/windows`,
        }),
      )
    },
    async updateClient({ id, values }) {
      await request({
        body: JSON.stringify(values),
        dependencies,
        method: 'PATCH',
        path: `${DELIVERY_CLIENTS_PATH}/${id}`,
      })
      /** A ficha volta inteira: janela e exceção não vêm no `PATCH`, e a tela precisa das duas. */
      return toDeliveryClientDetail(
        await request({ dependencies, method: 'GET', path: `${DELIVERY_CLIENTS_PATH}/${id}` }),
      )
    },
  }
}

export function getDeliveryClientsClient(): DeliveryClientsClient {
  return createDeliveryClientsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

async function request(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: 'GET' | 'PATCH' | 'PUT'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: input.body }),
        cache: 'no-store',
        headers,
        method: input.method,
      }),
    )
  } catch {
    throw new Error(DELIVERY_CLIENTS_ERROR.REQUEST_FAILED)
  }

  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new Error(DELIVERY_CLIENTS_ERROR.RESPONSE_INVALID)
  }
  /** O código sobe como veio: é ele que a tela traduz — trocá-lo por genérico apaga a explicação. */
  if (!response.ok) throw new Error(readErrorCode(payload))

  return payload
}

function readErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return DELIVERY_CLIENTS_ERROR.REQUEST_FAILED
  const error = (payload as { readonly error?: { readonly code?: unknown } }).error
  return typeof error?.code === 'string' ? error.code : DELIVERY_CLIENTS_ERROR.REQUEST_FAILED
}
