/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isBootstrapFirstAdminResponse } from './bootstrap.validation'
import type { BootstrapAdministratorInput, BootstrapFirstAdminResult } from './bootstrap.types'

const BOOTSTRAP_FIRST_ADMIN_PATH = '/bootstrap/first-admin'

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
}>

class BootstrapRequestError extends Error {
  public constructor() {
    super('BOOTSTRAP_UNAVAILABLE')
    this.name = 'BootstrapRequestError'
  }
}

export type BootstrapClient = Readonly<{
  createFirstAdmin: (
    input: Readonly<{ administrator: BootstrapAdministratorInput; token: string }>,
  ) => Promise<BootstrapFirstAdminResult>
}>

export type BootstrapClientFactory = (input: ClientDependencies) => BootstrapClient

async function createFirstAdmin(
  input: Readonly<{
    administrator: BootstrapAdministratorInput
    dependencies: ClientDependencies
    token: string
  }>,
): Promise<BootstrapFirstAdminResult> {
  const request = new Request(`${input.dependencies.apiBaseUrl}${BOOTSTRAP_FIRST_ADMIN_PATH}`, {
    body: JSON.stringify(input.administrator),
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${input.token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  })

  let response: Response
  try {
    response = await input.dependencies.fetch(request)
  } catch {
    throw new BootstrapRequestError()
  }
  if (!response.ok) throw new BootstrapRequestError()

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new BootstrapRequestError()
  }
  if (!isBootstrapFirstAdminResponse(payload)) throw new BootstrapRequestError()
  return payload.data
}

export const createBootstrapClient: BootstrapClientFactory = (dependencies) => ({
  createFirstAdmin: (input) => createFirstAdmin({ ...input, dependencies }),
})
