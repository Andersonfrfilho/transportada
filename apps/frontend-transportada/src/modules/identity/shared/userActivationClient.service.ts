/* Copyright (c) 2026 Ada Technology. MIT License. */
const USER_ACTIVATION_PATH = '/user-activation'
const ACTIVATION_CODE_PARAMETER = 'codigo'

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
}>

class UserActivationRejectedError extends Error {
  public constructor() {
    super('USER_ACTIVATION_REJECTED')
    this.name = 'UserActivationRejectedError'
  }
}

export type UserActivationInput = Readonly<{ code: string; password: string }>

export type UserActivationClient = Readonly<{
  activate: (input: UserActivationInput) => Promise<void>
}>

/** Código errado, expirado, já usado, senha recusada e rede caída colapsam no mesmo erro genérico. */
async function activate(
  input: UserActivationInput & Readonly<{ dependencies: ClientDependencies }>,
): Promise<void> {
  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiBaseUrl}${USER_ACTIVATION_PATH}`, {
        body: JSON.stringify({ code: input.code, password: input.password }),
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    )
  } catch {
    throw new UserActivationRejectedError()
  }

  if (!response.ok) throw new UserActivationRejectedError()
}

export function createUserActivationClient(dependencies: ClientDependencies): UserActivationClient {
  return { activate: (input) => activate({ ...input, dependencies }) }
}

/** O e-mail do convite manda `#codigo=…`; fragmento sem ele, ou vazio, não preenche nada. */
export function readActivationCodeFromHash(hash: string): string {
  const parameters = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  return (parameters.get(ACTIVATION_CODE_PARAMETER) ?? '').trim()
}
