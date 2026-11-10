/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  isContractorOption,
  isPortfolioClient,
  isSalesperson,
  type ContractorOption,
  type PortfolioClient,
  type Salesperson,
  type SalespersonInput,
} from './salesperson.validation'

export const SALESPEOPLE_PATH = '/salespeople'

export const SALESPERSON_FAILURE = {
  CONFLICT: 'conflict',
  FAILED: 'failed',
  FORBIDDEN: 'forbidden',
  INVALID: 'invalid',
  NOT_FOUND: 'notFound',
  UNAUTHENTICATED: 'unauthenticated',
  UNKNOWN_CLIENT: 'unknownClient',
} as const

export type SalespersonFailure = (typeof SALESPERSON_FAILURE)[keyof typeof SALESPERSON_FAILURE]

export class SalespersonRequestError extends Error {
  public readonly failure: SalespersonFailure

  public constructor(failure: SalespersonFailure) {
    super(`SALESPERSON_${failure.toUpperCase()}`)
    this.failure = failure
  }
}

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (request: Request, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type SalespersonClient = Readonly<{
  create: (input: SalespersonInput) => Promise<Salesperson>
  link: (id: string, contractorId: string) => Promise<Salesperson>
  list: () => Promise<readonly Salesperson[]>
  listContractors: () => Promise<readonly ContractorOption[]>
  readPortfolio: (id: string, contractorId: string) => Promise<readonly PortfolioClient[]>
  replacePortfolio: (
    id: string,
    contractorId: string,
    taxIds: readonly string[],
  ) => Promise<readonly PortfolioClient[]>
  unlink: (id: string, contractorId: string) => Promise<Salesperson>
  update: (id: string, input: SalespersonInput) => Promise<Salesperson>
}>

function failureOfStatus(status: number): SalespersonFailure {
  if (status === 400) return SALESPERSON_FAILURE.INVALID
  if (status === 401) return SALESPERSON_FAILURE.UNAUTHENTICATED
  if (status === 403) return SALESPERSON_FAILURE.FORBIDDEN
  if (status === 404) return SALESPERSON_FAILURE.NOT_FOUND
  if (status === 409) return SALESPERSON_FAILURE.CONFLICT
  if (status === 422) return SALESPERSON_FAILURE.UNKNOWN_CLIENT
  return SALESPERSON_FAILURE.FAILED
}

async function request(
  dependencies: ClientDependencies,
  init: Readonly<{ body?: unknown; method: 'DELETE' | 'GET' | 'POST' | 'PUT'; path: string }>,
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
    throw new SalespersonRequestError(SALESPERSON_FAILURE.FAILED)
  }
  if (!response.ok) throw new SalespersonRequestError(failureOfStatus(response.status))
  const body = (await response.json().catch(() => undefined)) as { data?: unknown } | undefined

  return body?.data
}

function toPerson(data: unknown): Salesperson {
  if (!isSalesperson(data)) throw new SalespersonRequestError(SALESPERSON_FAILURE.FAILED)

  return data
}

function toList<T>(data: unknown, guard: (value: unknown) => value is T): readonly T[] {
  if (!Array.isArray(data) || !data.every(guard)) {
    throw new SalespersonRequestError(SALESPERSON_FAILURE.FAILED)
  }

  return data
}

const item = (id: string) => `${SALESPEOPLE_PATH}/${encodeURIComponent(id)}`
const link = (id: string, contractorId: string) =>
  `${item(id)}/contractors/${encodeURIComponent(contractorId)}`

/** Spec 316 T1.4: o cadastro dos vendedores, o vínculo com a contratante e a carteira (`settings.manage`). */
export function createSalespersonClient(dependencies: ClientDependencies): SalespersonClient {
  return {
    create: async (input) =>
      toPerson(
        await request(dependencies, { body: input, method: 'POST', path: SALESPEOPLE_PATH }),
      ),
    link: async (id, contractorId) =>
      toPerson(await request(dependencies, { method: 'PUT', path: link(id, contractorId) })),
    list: async () =>
      toList(await request(dependencies, { method: 'GET', path: SALESPEOPLE_PATH }), isSalesperson),
    listContractors: async () =>
      toList(
        await request(dependencies, { method: 'GET', path: '/contractors?limit=100' }),
        isContractorOption,
      ),
    readPortfolio: async (id, contractorId) =>
      toList(
        await request(dependencies, {
          method: 'GET',
          path: `${link(id, contractorId)}/clients`,
        }),
        isPortfolioClient,
      ),
    replacePortfolio: async (id, contractorId, taxIds) =>
      toList(
        await request(dependencies, {
          body: { taxIds },
          method: 'PUT',
          path: `${link(id, contractorId)}/clients`,
        }),
        isPortfolioClient,
      ),
    unlink: async (id, contractorId) =>
      toPerson(await request(dependencies, { method: 'DELETE', path: link(id, contractorId) })),
    update: async (id, input) =>
      toPerson(await request(dependencies, { body: input, method: 'PUT', path: item(id) })),
  }
}
