/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import type {
  ContractorOccurrenceChannel,
  ContractorOccurrenceChannelGroup,
  ContractorOccurrenceChannelSaveBody,
} from './contractorOccurrenceChannel.types'
import {
  occurrenceChannelFromApi,
  occurrenceChannelGroupsFromApi,
  occurrenceChannelTestSent,
} from './contractorOccurrenceChannel.validation'

export const CONTRACTOR_OCCURRENCE_CHANNEL_GROUPS_PATH =
  '/contractor-occurrence-channels/whatsapp-groups'
export function contractorOccurrenceChannelPath(contractorId: string): string {
  return `/contractors/${encodeURIComponent(contractorId)}/occurrence-channel`
}

export const CONTRACTOR_OCCURRENCE_CHANNEL_ERROR = {
  REQUEST_FAILED: 'REQUEST_FAILED',
  RESPONSE_INVALID: 'RESPONSE_INVALID',
} as const

/** O código de erro da API viaja na mensagem, para a tela nomear a recusa. */
export class ContractorOccurrenceChannelRequestError extends Error {
  public readonly reason: string | undefined

  public constructor(code: string, reason?: string) {
    super(code)
    this.name = 'ContractorOccurrenceChannelRequestError'
    this.reason = reason
  }
}

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type ContractorOccurrenceChannelClient = Readonly<{
  get: (contractorId: string) => Promise<ContractorOccurrenceChannel>
  listGroups: () => Promise<readonly ContractorOccurrenceChannelGroup[]>
  save: (
    input: Readonly<{ body: ContractorOccurrenceChannelSaveBody; contractorId: string }>,
  ) => Promise<ContractorOccurrenceChannel>
  sendTest: (contractorId: string) => Promise<true>
}>

function readError(payload: unknown): { code: string; reason: string | undefined } {
  const error =
    typeof payload === 'object' && payload !== null ? (payload as { error?: unknown }).error : null
  if (typeof error !== 'object' || error === null) {
    return { code: CONTRACTOR_OCCURRENCE_CHANNEL_ERROR.REQUEST_FAILED, reason: undefined }
  }
  const { code, details } = error as { code?: unknown; details?: unknown }
  const first = Array.isArray(details)
    ? (details[0] as { message?: unknown } | undefined)
    : undefined
  return {
    code: typeof code === 'string' ? code : CONTRACTOR_OCCURRENCE_CHANNEL_ERROR.REQUEST_FAILED,
    reason: typeof first?.message === 'string' ? first.message : undefined,
  }
}

async function request(
  dependencies: ClientDependencies,
  input: Readonly<{ body?: object; method: 'GET' | 'POST' | 'PUT'; path: string }>,
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
    throw new ContractorOccurrenceChannelRequestError(
      CONTRACTOR_OCCURRENCE_CHANNEL_ERROR.REQUEST_FAILED,
    )
  }
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const { code, reason } = readError(payload)
    throw new ContractorOccurrenceChannelRequestError(code, reason)
  }
  return payload
}

function parsed<T>(read: () => T): T {
  try {
    return read()
  } catch {
    throw new ContractorOccurrenceChannelRequestError(
      CONTRACTOR_OCCURRENCE_CHANNEL_ERROR.RESPONSE_INVALID,
    )
  }
}

export function createContractorOccurrenceChannelClient(
  dependencies: ClientDependencies,
): ContractorOccurrenceChannelClient {
  return {
    async get(contractorId) {
      const payload = await request(dependencies, {
        method: 'GET',
        path: contractorOccurrenceChannelPath(contractorId),
      })
      return parsed(() => occurrenceChannelFromApi(payload))
    },
    async listGroups() {
      const payload = await request(dependencies, {
        method: 'GET',
        path: CONTRACTOR_OCCURRENCE_CHANNEL_GROUPS_PATH,
      })
      return parsed(() => occurrenceChannelGroupsFromApi(payload))
    },
    async save({ body, contractorId }) {
      const payload = await request(dependencies, {
        body,
        method: 'PUT',
        path: contractorOccurrenceChannelPath(contractorId),
      })
      return parsed(() => occurrenceChannelFromApi(payload))
    },
    async sendTest(contractorId) {
      const payload = await request(dependencies, {
        method: 'POST',
        path: `${contractorOccurrenceChannelPath(contractorId)}/test`,
      })
      return parsed(() => occurrenceChannelTestSent(payload))
    },
  }
}

export function getContractorOccurrenceChannelClient(): ContractorOccurrenceChannelClient {
  return createContractorOccurrenceChannelClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}
