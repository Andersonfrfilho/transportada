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
  checkAvailability: () => Promise<boolean>
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

const BOOTSTRAP_CLOSED_STATUS = 404

/**
 * Pergunta sem credencial: a resposta é sobre o ambiente, não sobre quem perguntou. Só o 404 —
 * o mesmo de uma rota que não existe — fecha a tela; qualquer outra falha deixa o formulário de pé,
 * porque API fora do ar não pode trancar uma instalação que ainda precisa do primeiro acesso.
 */
async function checkAvailability(dependencies: ClientDependencies): Promise<boolean> {
  const request = new Request(`${dependencies.apiBaseUrl}${BOOTSTRAP_FIRST_ADMIN_PATH}`, {
    cache: 'no-store',
    method: 'GET',
  })

  try {
    const response = await dependencies.fetch(request)
    return response.status !== BOOTSTRAP_CLOSED_STATUS
  } catch {
    return true
  }
}

export const createBootstrapClient: BootstrapClientFactory = (dependencies) => ({
  checkAvailability: () => checkAvailability(dependencies),
  createFirstAdmin: (input) => createFirstAdmin({ ...input, dependencies }),
})
