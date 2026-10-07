/* Copyright (c) 2026 Ada Technology. MIT License. */
import { COMPANY_CREW_SETTINGS_PATH } from './fleet.constant'
import { isCrewSettingsResponse, type CrewSettings } from './crewSettings.validation'

const REQUEST_FAILED = 'CREW_SETTINGS_REQUEST_FAILED'
const NETWORK_ERROR = 'CREW_SETTINGS_NETWORK_ERROR'
const RESPONSE_INVALID = 'CREW_SETTINGS_RESPONSE_INVALID'

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

/** O código de erro da API viaja na mensagem, para a tela nomear a recusa. */
export class CrewSettingsRequestError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'CrewSettingsRequestError'
  }
}

export type CrewSettingsClient = Readonly<{
  get: () => Promise<CrewSettings>
  save: (helperDailyRate: null | string) => Promise<CrewSettings>
}>

type SendInput = Readonly<{
  body?: Readonly<{ helperDailyRate: null | string }>
  dependencies: ClientDependencies
  method: string
}>

async function send(input: SendInput): Promise<Response> {
  const accessToken = await input.dependencies.getAccessToken()
  try {
    return await input.dependencies.fetch(
      new Request(`${input.dependencies.apiBaseUrl}${COMPANY_CREW_SETTINGS_PATH}`, {
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
    throw new CrewSettingsRequestError(NETWORK_ERROR)
  }
}

function readErrorCode(body: unknown): string {
  if (typeof body !== 'object' || body === null) return REQUEST_FAILED
  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return REQUEST_FAILED
  const code = (error as { code?: unknown }).code

  return typeof code === 'string' ? code : REQUEST_FAILED
}

async function readSettings(response: Response): Promise<CrewSettings> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new CrewSettingsRequestError(readErrorCode(body))
  if (!isCrewSettingsResponse(body)) throw new CrewSettingsRequestError(RESPONSE_INVALID)

  return body.data
}

export function createCrewSettingsClient(dependencies: ClientDependencies): CrewSettingsClient {
  return {
    async get() {
      return readSettings(await send({ dependencies, method: 'GET' }))
    },
    async save(helperDailyRate) {
      return readSettings(await send({ body: { helperDailyRate }, dependencies, method: 'PUT' }))
    },
  }
}
