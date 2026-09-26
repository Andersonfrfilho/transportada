/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  contactFromApi,
  contactsFromApi,
  contractorsFromApi,
} from './contractorContactsResponse.validation'
import type {
  ContractorContact,
  ContractorContactStatus,
  ContractorSummary,
} from './contractorContacts.types'
import type { ContractorContactPayload } from './contractorContacts.validation'

export const CONTRACTORS_PATH = '/contractors'

export const CONTRACTOR_CONTACTS_ERROR = {
  REQUEST_FAILED: 'REQUEST_FAILED',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
} as const

/**
 * `web.md` §11: a recusa do servidor nomeia o campo (`error.details[]`) — o 409
 * `CONTRACTOR_CONTACT_EMAIL_TAKEN` chega aqui com `details: [{ field: 'email', message }]`, e é
 * isso que ancora o aviso no campo em vez de um rodapé genérico.
 */
export class ContractorContactsRequestError extends Error {
  public readonly details: ReadonlyMap<string, string>

  public constructor(code: string, details: ReadonlyMap<string, string> = new Map()) {
    super(code)
    this.name = 'ContractorContactsRequestError'
    this.details = details
  }
}

/** Spec 183 T303: o painel manda só os campos novos; os dois antigos a API deriva dos tipos (T302). */
export type ContractorContactCreateBody = ContractorContactPayload

export type ContractorContactUpdateBody = Readonly<
  Partial<ContractorContactPayload> & { status?: ContractorContactStatus }
>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type ContractorContactsClient = Readonly<{
  createContact: (
    input: Readonly<{ body: ContractorContactCreateBody; contractorId: string }>,
  ) => Promise<ContractorContact>
  listContacts: (contractorId: string) => Promise<readonly ContractorContact[]>
  listContractors: () => Promise<readonly ContractorSummary[]>
  updateContact: (
    input: Readonly<{
      body: ContractorContactUpdateBody
      contactId: string
      contractorId: string
    }>,
  ) => Promise<ContractorContact>
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function readErrorDetails(payload: unknown): ReadonlyMap<string, string> {
  const details = new Map<string, string>()
  if (!isRecord(payload) || !isRecord(payload.error) || !Array.isArray(payload.error.details)) {
    return details
  }
  for (const detail of payload.error.details) {
    if (isRecord(detail) && isString(detail.field) && isString(detail.message)) {
      details.set(detail.field, detail.message)
    }
  }
  return details
}

function readErrorCode(payload: unknown): string {
  if (
    isRecord(payload) &&
    isRecord(payload.error) &&
    isString((payload.error as { code?: unknown }).code)
  ) {
    return (payload.error as { code: string }).code
  }
  return CONTRACTOR_CONTACTS_ERROR.REQUEST_FAILED
}

async function request(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: 'GET' | 'PATCH' | 'POST'
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
    throw new ContractorContactsRequestError(CONTRACTOR_CONTACTS_ERROR.REQUEST_FAILED)
  }

  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new ContractorContactsRequestError(CONTRACTOR_CONTACTS_ERROR.RESPONSE_INVALID)
  }
  if (!response.ok) {
    throw new ContractorContactsRequestError(readErrorCode(payload), readErrorDetails(payload))
  }

  return payload
}

export function createContractorContactsClient(
  dependencies: ClientDependencies,
): ContractorContactsClient {
  return {
    async createContact({ body, contractorId }) {
      return contactFromApi(
        await request({
          body: JSON.stringify(body),
          dependencies,
          method: 'POST',
          path: `${CONTRACTORS_PATH}/${contractorId}/contacts`,
        }),
      )
    },
    async listContacts(contractorId) {
      return contactsFromApi(
        await request({
          dependencies,
          method: 'GET',
          path: `${CONTRACTORS_PATH}/${contractorId}/contacts`,
        }),
      )
    },
    async listContractors() {
      return contractorsFromApi(
        await request({ dependencies, method: 'GET', path: `${CONTRACTORS_PATH}?limit=100` }),
      )
    },
    async updateContact({ body, contactId, contractorId }) {
      return contactFromApi(
        await request({
          body: JSON.stringify(body),
          dependencies,
          method: 'PATCH',
          path: `${CONTRACTORS_PATH}/${contractorId}/contacts/${contactId}`,
        }),
      )
    },
  }
}

export function getContractorContactsClient(): ContractorContactsClient {
  return createContractorContactsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
