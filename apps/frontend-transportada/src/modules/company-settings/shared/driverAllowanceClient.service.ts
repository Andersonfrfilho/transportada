/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isDriverAllowanceResponse,
  type DriverAllowanceSettings,
} from './driverAllowance.validation'

const DRIVER_ALLOWANCE_PATH = '/company-settings/driver-allowance'

/** A recusa sem nome da API. Escrita uma vez: quatro cópias divergem sem nenhuma parecer errada. */
const REQUEST_FAILED = 'DRIVER_ALLOWANCE_REQUEST_FAILED'
const NETWORK_ERROR = 'DRIVER_ALLOWANCE_NETWORK_ERROR'
const RESPONSE_INVALID = 'DRIVER_ALLOWANCE_RESPONSE_INVALID'

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

/** O código de erro da API viaja na mensagem, para a tela nomear a recusa. */
export class DriverAllowanceRequestError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'DriverAllowanceRequestError'
  }
}

export type DriverAllowanceClient = Readonly<{
  clear: () => Promise<void>
  get: () => Promise<DriverAllowanceSettings>
  save: (amount: string) => Promise<DriverAllowanceSettings>
}>

async function send(
  input: Readonly<{
    body?: Readonly<{ amount: string }>
    dependencies: ClientDependencies
    method: string
  }>,
): Promise<Response> {
  const accessToken = await input.dependencies.getAccessToken()
  try {
    return await input.dependencies.fetch(
      new Request(`${input.dependencies.apiBaseUrl}${DRIVER_ALLOWANCE_PATH}`, {
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
    throw new DriverAllowanceRequestError(NETWORK_ERROR)
  }
}

async function readSettings(response: Response): Promise<DriverAllowanceSettings> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new DriverAllowanceRequestError(readErrorCode(body))
  if (!isDriverAllowanceResponse(body)) {
    throw new DriverAllowanceRequestError(RESPONSE_INVALID)
  }

  return body.data
}

function readErrorCode(body: unknown): string {
  if (typeof body !== 'object' || body === null) return REQUEST_FAILED
  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return REQUEST_FAILED
  const code = (error as { code?: unknown }).code

  return typeof code === 'string' ? code : REQUEST_FAILED
}

export function createDriverAllowanceClient(
  dependencies: ClientDependencies,
): DriverAllowanceClient {
  return {
    async clear() {
      const response = await send({ dependencies, method: 'DELETE' })
      if (!response.ok) throw new DriverAllowanceRequestError(REQUEST_FAILED)
    },
    async get() {
      return readSettings(await send({ dependencies, method: 'GET' }))
    },
    async save(amount) {
      return readSettings(await send({ body: { amount }, dependencies, method: 'PUT' }))
    },
  }
}
