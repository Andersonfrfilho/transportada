/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isFederalTaxResponse, type FederalTaxSettings } from './federalTax.validation'
import type { FederalTaxSubmission } from './federalTaxSuggestion.service'

const FEDERAL_TAXES_PATH = '/company-settings/federal-taxes'

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

/** O código de erro da API viaja na mensagem, para a tela nomear a recusa. */
export class FederalTaxRequestError extends Error {
  public constructor(code: string) {
    super(code)
    this.name = 'FederalTaxRequestError'
  }
}

export type FederalTaxClient = Readonly<{
  clear: () => Promise<void>
  get: () => Promise<FederalTaxSettings | null>
  save: (submission: FederalTaxSubmission) => Promise<FederalTaxSettings | null>
}>

async function send(
  input: Readonly<{
    body?: FederalTaxSubmission
    dependencies: ClientDependencies
    method: string
  }>,
): Promise<Response> {
  const accessToken = await input.dependencies.getAccessToken()
  try {
    return await input.dependencies.fetch(
      new Request(`${input.dependencies.apiBaseUrl}${FEDERAL_TAXES_PATH}`, {
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
    throw new FederalTaxRequestError('FEDERAL_TAX_NETWORK_ERROR')
  }
}

async function readSettings(response: Response): Promise<FederalTaxSettings | null> {
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new FederalTaxRequestError(readErrorCode(body))
  if (!isFederalTaxResponse(body)) throw new FederalTaxRequestError('FEDERAL_TAX_RESPONSE_INVALID')

  return body.data
}

function readErrorCode(body: unknown): string {
  if (typeof body !== 'object' || body === null) return 'FEDERAL_TAX_REQUEST_FAILED'
  const error = (body as { error?: unknown }).error
  if (typeof error !== 'object' || error === null) return 'FEDERAL_TAX_REQUEST_FAILED'
  const code = (error as { code?: unknown }).code

  return typeof code === 'string' ? code : 'FEDERAL_TAX_REQUEST_FAILED'
}

export function createFederalTaxClient(dependencies: ClientDependencies): FederalTaxClient {
  return {
    async clear() {
      const response = await send({ dependencies, method: 'DELETE' })
      if (!response.ok) throw new FederalTaxRequestError('FEDERAL_TAX_REQUEST_FAILED')
    },
    async get() {
      return readSettings(await send({ dependencies, method: 'GET' }))
    },
    async save(submission) {
      return readSettings(await send({ body: submission, dependencies, method: 'PUT' }))
    },
  }
}
