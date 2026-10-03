/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  LOCATION_RETENTION_ERROR,
  LOCATION_RETENTION_IMPACT_PATH,
  LOCATION_RETENTION_PATH,
} from './locationRetention.constant'
import {
  isLocationRetentionImpact,
  isLocationRetentionSettings,
  type LocationRetentionDraft,
  type LocationRetentionImpact,
  type LocationRetentionSettings,
} from './locationRetention.validation'

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

/** O código de erro da API viaja na mensagem, para a tela nomear a recusa. */
export class LocationRetentionRequestError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'LocationRetentionRequestError'
  }
}

export type LocationRetentionClient = Readonly<{
  clear: () => Promise<void>
  get: () => Promise<LocationRetentionSettings>
  readImpact: (retentionDays: number) => Promise<LocationRetentionImpact>
  save: (draft: LocationRetentionDraft) => Promise<LocationRetentionSettings>
}>

async function send(
  input: Readonly<{
    body?: LocationRetentionDraft
    dependencies: ClientDependencies
    method: string
    path: string
  }>,
): Promise<Response> {
  const accessToken = await input.dependencies.getAccessToken()
  try {
    return await input.dependencies.fetch(
      new Request(`${input.dependencies.apiBaseUrl}${input.path}`, {
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
    throw new LocationRetentionRequestError(LOCATION_RETENTION_ERROR.NETWORK)
  }
}

function readErrorCode(body: unknown): string {
  if (typeof body !== 'object' || body === null) return LOCATION_RETENTION_ERROR.REQUEST_FAILED
  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return LOCATION_RETENTION_ERROR.REQUEST_FAILED
  const code = (error as { code?: unknown }).code

  return typeof code === 'string' ? code : LOCATION_RETENTION_ERROR.REQUEST_FAILED
}

async function readData(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new LocationRetentionRequestError(readErrorCode(body))
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new LocationRetentionRequestError(LOCATION_RETENTION_ERROR.RESPONSE_INVALID)
  }

  return body.data
}

async function readSettings(response: Response): Promise<LocationRetentionSettings> {
  const data = await readData(response)
  if (!isLocationRetentionSettings(data)) {
    throw new LocationRetentionRequestError(LOCATION_RETENTION_ERROR.RESPONSE_INVALID)
  }

  return data
}

export function createLocationRetentionClient(
  dependencies: ClientDependencies,
): LocationRetentionClient {
  return {
    async clear() {
      const response = await send({
        dependencies,
        method: 'DELETE',
        path: LOCATION_RETENTION_PATH,
      })
      if (!response.ok)
        throw new LocationRetentionRequestError(LOCATION_RETENTION_ERROR.REQUEST_FAILED)
    },
    async get() {
      return readSettings(
        await send({ dependencies, method: 'GET', path: LOCATION_RETENTION_PATH }),
      )
    },
    async readImpact(retentionDays) {
      const response = await send({
        dependencies,
        method: 'GET',
        path: `${LOCATION_RETENTION_IMPACT_PATH}?retentionDays=${retentionDays}`,
      })
      const data = await readData(response)
      if (!isLocationRetentionImpact(data)) {
        throw new LocationRetentionRequestError(LOCATION_RETENTION_ERROR.RESPONSE_INVALID)
      }

      return data
    },
    async save(draft) {
      return readSettings(
        await send({ body: draft, dependencies, method: 'PUT', path: LOCATION_RETENTION_PATH }),
      )
    },
  }
}
