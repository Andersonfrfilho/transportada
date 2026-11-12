/* Copyright (c) 2026 Ada Technology. MIT License. */
import { driverWhatsappGroupPath, FLEET_WHATSAPP_GROUPS_PATH } from './fleet.constant'
import {
  isDriverWhatsappGroupResponse,
  isWhatsappGroupListResponse,
  type DriverWhatsappGroup,
  type WhatsappGroupOption,
} from './driverWhatsappGroup.validation'

const REQUEST_FAILED = 'DRIVER_WHATSAPP_GROUP_REQUEST_FAILED'
const NETWORK_ERROR = 'DRIVER_WHATSAPP_GROUP_NETWORK_ERROR'
const RESPONSE_INVALID = 'DRIVER_WHATSAPP_GROUP_RESPONSE_INVALID'

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

/** O código de erro da API viaja na mensagem, para a tela nomear a recusa. */
export class DriverWhatsappGroupRequestError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'DriverWhatsappGroupRequestError'
  }
}

export type DriverWhatsappGroupClient = Readonly<{
  get: (driverId: string) => Promise<DriverWhatsappGroup | null>
  listGroups: () => Promise<readonly WhatsappGroupOption[]>
  remove: (driverId: string) => Promise<void>
  set: (
    input: Readonly<{ driverId: string; groupJid: string; groupName: string }>,
  ) => Promise<DriverWhatsappGroup>
}>

async function send(
  dependencies: ClientDependencies,
  input: Readonly<{ body?: unknown; method: string; path: string }>,
): Promise<unknown> {
  const accessToken = await dependencies.getAccessToken()
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(`${dependencies.apiBaseUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method: input.method,
      }),
    )
  } catch {
    throw new DriverWhatsappGroupRequestError(NETWORK_ERROR)
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new DriverWhatsappGroupRequestError(readErrorCode(body))
  return body
}

function readErrorCode(body: unknown): string {
  if (typeof body !== 'object' || body === null) return REQUEST_FAILED
  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return REQUEST_FAILED
  const code = (error as { code?: unknown }).code

  return typeof code === 'string' ? code : REQUEST_FAILED
}

export function createDriverWhatsappGroupClient(
  dependencies: ClientDependencies,
): DriverWhatsappGroupClient {
  return {
    async get(driverId) {
      const body = await send(dependencies, {
        method: 'GET',
        path: driverWhatsappGroupPath(driverId),
      })
      if (!isDriverWhatsappGroupResponse(body)) {
        throw new DriverWhatsappGroupRequestError(RESPONSE_INVALID)
      }
      return body.data
    },
    async listGroups() {
      const body = await send(dependencies, { method: 'GET', path: FLEET_WHATSAPP_GROUPS_PATH })
      if (!isWhatsappGroupListResponse(body)) {
        throw new DriverWhatsappGroupRequestError(RESPONSE_INVALID)
      }
      return body.data
    },
    async remove(driverId) {
      await send(dependencies, { method: 'DELETE', path: driverWhatsappGroupPath(driverId) })
    },
    async set(input) {
      const body = await send(dependencies, {
        body: { groupJid: input.groupJid, groupName: input.groupName },
        method: 'PUT',
        path: driverWhatsappGroupPath(input.driverId),
      })
      if (!isDriverWhatsappGroupResponse(body) || body.data === null) {
        throw new DriverWhatsappGroupRequestError(RESPONSE_INVALID)
      }
      return body.data
    },
  }
}
