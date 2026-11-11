/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isCanhotoPickup,
  type CanhotoPickup,
  type CanhotoPickupStatus,
} from './canhotoPickup.service'

const CANHOTO_PICKUPS_PATH = '/trip-canhoto-pickups'
const LIST_LIMIT = 200

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

/** O código de erro da API viaja na mensagem, para a tela nomear a recusa. */
export class CanhotoPickupRequestError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'CanhotoPickupRequestError'
  }
}

export type CanhotoPickupClient = Readonly<{
  list: (statuses: readonly CanhotoPickupStatus[]) => Promise<readonly CanhotoPickup[]>
  schedule: (input: Readonly<{ pickupId: string; tripId: string }>) => Promise<CanhotoPickup>
  unschedule: (pickupId: string) => Promise<CanhotoPickup>
}>

function readErrorCode(body: unknown): string {
  if (typeof body !== 'object' || body === null) return 'REQUEST_FAILED'
  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return 'REQUEST_FAILED'
  const code = (error as { code?: unknown }).code

  return typeof code === 'string' ? code : 'REQUEST_FAILED'
}

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
    throw new CanhotoPickupRequestError('NETWORK')
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new CanhotoPickupRequestError(readErrorCode(body))
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new CanhotoPickupRequestError('RESPONSE_INVALID')
  }

  return body.data
}

function readPickup(data: unknown): CanhotoPickup {
  if (!isCanhotoPickup(data)) throw new CanhotoPickupRequestError('RESPONSE_INVALID')

  return data
}

export function createCanhotoPickupClient(dependencies: ClientDependencies): CanhotoPickupClient {
  return {
    async list(statuses) {
      const search = new URLSearchParams()
      for (const status of statuses) search.append('status', status)
      search.set('limit', String(LIST_LIMIT))
      const data = await send(dependencies, {
        method: 'GET',
        path: `${CANHOTO_PICKUPS_PATH}?${search.toString()}`,
      })
      if (!Array.isArray(data)) throw new CanhotoPickupRequestError('RESPONSE_INVALID')

      return data.map(readPickup)
    },
    async schedule(input) {
      return readPickup(
        await send(dependencies, {
          body: { tripId: input.tripId },
          method: 'POST',
          path: `${CANHOTO_PICKUPS_PATH}/${encodeURIComponent(input.pickupId)}/schedule`,
        }),
      )
    },
    async unschedule(pickupId) {
      return readPickup(
        await send(dependencies, {
          method: 'POST',
          path: `${CANHOTO_PICKUPS_PATH}/${encodeURIComponent(pickupId)}/unschedule`,
        }),
      )
    },
  }
}
