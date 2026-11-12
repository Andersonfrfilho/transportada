/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  DELIVERY_CLIENT_EMAILS_ERROR,
  DeliveryClientEmailsRequestError,
} from './deliveryClientEmailsClient.service'
import type { DeliveryClientWhatsApp } from './deliveryClientWhatsApp.types'
import {
  deliveryClientWhatsAppFromApi,
  deliveryClientWhatsAppListFromApi,
} from './deliveryClientWhatsApp.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type DeliveryClientWhatsAppClient = Readonly<{
  add: (
    input: Readonly<{ body: { label: string; number: string }; taxId: string }>,
  ) => Promise<DeliveryClientWhatsApp>
  list: (taxId: string) => Promise<readonly DeliveryClientWhatsApp[]>
  remove: (input: Readonly<{ numberId: string; taxId: string }>) => Promise<void>
  update: (
    input: Readonly<{ body: { label?: string; number?: string }; numberId: string; taxId: string }>,
  ) => Promise<DeliveryClientWhatsApp>
}>

function readErrorCode(payload: unknown): string {
  if (typeof payload === 'object' && payload !== null) {
    const error = (payload as { error?: unknown }).error
    const code =
      typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : null
    if (typeof code === 'string') return code
  }
  return DELIVERY_CLIENT_EMAILS_ERROR.REQUEST_FAILED
}

async function request(
  dependencies: ClientDependencies,
  input: Readonly<{ body?: object; method: 'DELETE' | 'GET' | 'PATCH' | 'POST'; path: string }>,
): Promise<unknown> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${await dependencies.getAccessToken()}`,
  }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(`${dependencies.apiUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        cache: 'no-store',
        headers,
        method: input.method,
      }),
    )
  } catch {
    throw new DeliveryClientEmailsRequestError(DELIVERY_CLIENT_EMAILS_ERROR.REQUEST_FAILED)
  }
  if (response.status === 204) return {}
  const raw = await response.text()
  let payload: unknown = {}
  try {
    if (raw.length > 0) payload = JSON.parse(raw) as unknown
  } catch {
    throw new DeliveryClientEmailsRequestError(DELIVERY_CLIENT_EMAILS_ERROR.RESPONSE_INVALID)
  }
  if (!response.ok) throw new DeliveryClientEmailsRequestError(readErrorCode(payload))
  return payload
}

function parsed<T>(read: () => T): T {
  try {
    return read()
  } catch {
    throw new DeliveryClientEmailsRequestError(DELIVERY_CLIENT_EMAILS_ERROR.RESPONSE_INVALID)
  }
}

function basePath(taxId: string): string {
  return `/delivery-clients/${encodeURIComponent(taxId)}/whatsapp`
}

export function createDeliveryClientWhatsAppClient(
  dependencies: ClientDependencies,
): DeliveryClientWhatsAppClient {
  return {
    async add({ body, taxId }) {
      const payload = await request(dependencies, { body, method: 'POST', path: basePath(taxId) })
      return parsed(() => deliveryClientWhatsAppFromApi(payload))
    },
    async list(taxId) {
      const payload = await request(dependencies, { method: 'GET', path: basePath(taxId) })
      return parsed(() => deliveryClientWhatsAppListFromApi(payload))
    },
    async remove({ numberId, taxId }) {
      await request(dependencies, { method: 'DELETE', path: `${basePath(taxId)}/${numberId}` })
    },
    async update({ body, numberId, taxId }) {
      const payload = await request(dependencies, {
        body,
        method: 'PATCH',
        path: `${basePath(taxId)}/${numberId}`,
      })
      return parsed(() => deliveryClientWhatsAppFromApi(payload))
    },
  }
}

export function getDeliveryClientWhatsAppClient(): DeliveryClientWhatsAppClient {
  return createDeliveryClientWhatsAppClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
