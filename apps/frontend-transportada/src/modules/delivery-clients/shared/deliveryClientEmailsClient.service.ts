/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import type {
  DeliveryClientEmail,
  DeliveryClientEmailCreateBody,
} from './deliveryClientEmails.types'
import {
  deliveryClientEmailFromApi,
  deliveryClientEmailsFromApi,
} from './deliveryClientEmails.validation'

export const DELIVERY_CLIENT_EMAILS_ERROR = {
  LIMIT_REACHED: 'DELIVERY_CLIENT_EMAIL_LIMIT_REACHED',
  REQUEST_FAILED: 'REQUEST_FAILED',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
} as const

export class DeliveryClientEmailsRequestError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'DeliveryClientEmailsRequestError'
  }
}

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type DeliveryClientEmailsClient = Readonly<{
  addEmail: (
    input: Readonly<{ body: DeliveryClientEmailCreateBody; taxId: string }>,
  ) => Promise<DeliveryClientEmail>
  listEmails: (taxId: string) => Promise<readonly DeliveryClientEmail[]>
  removeEmail: (input: Readonly<{ emailId: string; taxId: string }>) => Promise<void>
  updateLabel: (
    input: Readonly<{ emailId: string; label: string; taxId: string }>,
  ) => Promise<DeliveryClientEmail>
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

/** Spec 279 RF1 (T2): o `taxId` vai codificado, como segmento opaco do caminho. */
function emailsPath(taxId: string): string {
  return `/delivery-clients/${encodeURIComponent(taxId)}/emails`
}

export function createDeliveryClientEmailsClient(
  dependencies: ClientDependencies,
): DeliveryClientEmailsClient {
  return {
    async addEmail({ body, taxId }) {
      const payload = await request(dependencies, { body, method: 'POST', path: emailsPath(taxId) })
      return parsed(() => deliveryClientEmailFromApi(payload))
    },
    async listEmails(taxId) {
      const payload = await request(dependencies, { method: 'GET', path: emailsPath(taxId) })
      return parsed(() => deliveryClientEmailsFromApi(payload))
    },
    async removeEmail({ emailId, taxId }) {
      await request(dependencies, { method: 'DELETE', path: `${emailsPath(taxId)}/${emailId}` })
    },
    async updateLabel({ emailId, label, taxId }) {
      const payload = await request(dependencies, {
        body: { label },
        method: 'PATCH',
        path: `${emailsPath(taxId)}/${emailId}`,
      })
      return parsed(() => deliveryClientEmailFromApi(payload))
    },
  }
}

export function getDeliveryClientEmailsClient(): DeliveryClientEmailsClient {
  return createDeliveryClientEmailsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
