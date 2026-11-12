/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isContractorAutomation,
  type ContractorAutomation,
  type ContractorAutomationInput,
} from './contractorAutomation.validation'

export const CONTRACTOR_AUTOMATIONS_PATH = '/contractor-automations'

export const CONTRACTOR_AUTOMATION_FAILURE = {
  CONFLICT: 'conflict',
  FAILED: 'failed',
  FORBIDDEN: 'forbidden',
  INVALID: 'invalid',
  NOT_FOUND: 'notFound',
  UNAUTHENTICATED: 'unauthenticated',
} as const

export type ContractorAutomationFailure =
  (typeof CONTRACTOR_AUTOMATION_FAILURE)[keyof typeof CONTRACTOR_AUTOMATION_FAILURE]

export class ContractorAutomationRequestError extends Error {
  public readonly failure: ContractorAutomationFailure

  public constructor(failure: ContractorAutomationFailure) {
    super(`CONTRACTOR_AUTOMATION_${failure.toUpperCase()}`)
    this.failure = failure
  }
}

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (request: Request, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type ContractorAutomationClient = Readonly<{
  create: (input: ContractorAutomationInput) => Promise<ContractorAutomation>
  list: () => Promise<readonly ContractorAutomation[]>
  update: (id: string, input: ContractorAutomationInput) => Promise<ContractorAutomation>
}>

function failureOfStatus(status: number): ContractorAutomationFailure {
  if (status === 400) return CONTRACTOR_AUTOMATION_FAILURE.INVALID
  if (status === 401) return CONTRACTOR_AUTOMATION_FAILURE.UNAUTHENTICATED
  if (status === 403) return CONTRACTOR_AUTOMATION_FAILURE.FORBIDDEN
  if (status === 404) return CONTRACTOR_AUTOMATION_FAILURE.NOT_FOUND
  if (status === 409) return CONTRACTOR_AUTOMATION_FAILURE.CONFLICT
  return CONTRACTOR_AUTOMATION_FAILURE.FAILED
}

async function request(
  dependencies: ClientDependencies,
  init: Readonly<{
    body?: ContractorAutomationInput
    method: 'GET' | 'POST' | 'PUT'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await dependencies.getAccessToken()
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(`${dependencies.apiUrl}${init.path}`, {
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method: init.method,
      }),
    )
  } catch {
    throw new ContractorAutomationRequestError(CONTRACTOR_AUTOMATION_FAILURE.FAILED)
  }
  if (!response.ok) throw new ContractorAutomationRequestError(failureOfStatus(response.status))
  const body = (await response.json().catch(() => undefined)) as { data?: unknown } | undefined

  return body?.data
}

function toAutomation(data: unknown): ContractorAutomation {
  if (!isContractorAutomation(data)) {
    throw new ContractorAutomationRequestError(CONTRACTOR_AUTOMATION_FAILURE.FAILED)
  }

  return data
}

/** Spec 285: o cadastro da automação do fluxo semanal (`settings.manage`). */
export function createContractorAutomationClient(
  dependencies: ClientDependencies,
): ContractorAutomationClient {
  return {
    create: async (input) =>
      toAutomation(
        await request(dependencies, {
          body: input,
          method: 'POST',
          path: CONTRACTOR_AUTOMATIONS_PATH,
        }),
      ),
    list: async () => {
      const data = await request(dependencies, { method: 'GET', path: CONTRACTOR_AUTOMATIONS_PATH })
      if (!Array.isArray(data)) {
        throw new ContractorAutomationRequestError(CONTRACTOR_AUTOMATION_FAILURE.FAILED)
      }

      return data.map(toAutomation)
    },
    update: async (id, input) =>
      toAutomation(
        await request(dependencies, {
          body: input,
          method: 'PUT',
          path: `${CONTRACTOR_AUTOMATIONS_PATH}/${encodeURIComponent(id)}`,
        }),
      ),
  }
}
