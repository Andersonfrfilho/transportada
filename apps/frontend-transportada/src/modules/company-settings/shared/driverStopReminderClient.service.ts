/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isDriverStopReminderResponse,
  type DriverStopReminderBody,
  type DriverStopReminderSettings,
} from './driverStopReminder.validation'

const DRIVER_STOP_REMINDER_PATH = '/settings/driver-stop-reminders'

const REQUEST_FAILED = 'DRIVER_STOP_REMINDER_REQUEST_FAILED'
const NETWORK_ERROR = 'DRIVER_STOP_REMINDER_NETWORK_ERROR'
const RESPONSE_INVALID = 'DRIVER_STOP_REMINDER_RESPONSE_INVALID'

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

/** O código de erro da API viaja na mensagem, para a tela nomear a recusa. */
export class DriverStopReminderRequestError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'DriverStopReminderRequestError'
  }
}

export type DriverStopReminderClient = Readonly<{
  get: () => Promise<DriverStopReminderSettings>
  save: (body: DriverStopReminderBody) => Promise<DriverStopReminderSettings>
}>

async function send(
  input: Readonly<{
    body?: DriverStopReminderBody
    dependencies: ClientDependencies
    method: string
  }>,
): Promise<Response> {
  const accessToken = await input.dependencies.getAccessToken()
  try {
    return await input.dependencies.fetch(
      new Request(`${input.dependencies.apiBaseUrl}${DRIVER_STOP_REMINDER_PATH}`, {
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
    throw new DriverStopReminderRequestError(NETWORK_ERROR)
  }
}

function readErrorCode(body: unknown): string {
  if (typeof body !== 'object' || body === null) return REQUEST_FAILED
  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return REQUEST_FAILED
  const code = (error as { code?: unknown }).code

  return typeof code === 'string' ? code : REQUEST_FAILED
}

async function readSettings(response: Response): Promise<DriverStopReminderSettings> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new DriverStopReminderRequestError(readErrorCode(body))
  if (!isDriverStopReminderResponse(body)) {
    throw new DriverStopReminderRequestError(RESPONSE_INVALID)
  }

  return body.data
}

export function createDriverStopReminderClient(
  dependencies: ClientDependencies,
): DriverStopReminderClient {
  return {
    async get() {
      return readSettings(await send({ dependencies, method: 'GET' }))
    },
    async save(body) {
      return readSettings(await send({ body, dependencies, method: 'PUT' }))
    },
  }
}
