/* Copyright (c) 2026 Ada Technology. MIT License. */
const PASSWORD_RESETS_PATH = '/password-resets'
const PASSWORD_RESET_CONFIRM_PATH = '/password-resets/confirm'

type ClientDependencies = Readonly<{
  apiBaseUrl: string
  fetch: (request: Request) => Promise<Response>
}>

class PasswordResetRejectedError extends Error {
  public constructor() {
    super('PASSWORD_RESET_REJECTED')
    this.name = 'PasswordResetRejectedError'
  }
}

export type PasswordResetClient = Readonly<{
  confirm: (input: Readonly<{ code: string; password: string }>) => Promise<void>
  request: (input: Readonly<{ username: string }>) => Promise<void>
}>

export type PasswordResetClientFactory = (input: ClientDependencies) => PasswordResetClient

function buildRequest(input: Readonly<{ body: unknown; path: string; url: string }>): Request {
  return new Request(input.url, {
    body: JSON.stringify(input.body),
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

/**
 * O primeiro passo é silencioso: login inexistente, desabilitado e válido respondem igual, e o
 * cliente não pode reintroduzir a diferença. Falha de rede aqui também segue em frente — a tela
 * avança para o campo do código de qualquer jeito, e quem não recebeu e-mail pede de novo.
 */
async function requestCode(
  input: Readonly<{ dependencies: ClientDependencies; username: string }>,
): Promise<void> {
  try {
    await input.dependencies.fetch(
      buildRequest({
        body: { username: input.username },
        path: PASSWORD_RESETS_PATH,
        url: `${input.dependencies.apiBaseUrl}${PASSWORD_RESETS_PATH}`,
      }),
    )
  } catch {
    // Silêncio deliberado: ver o comentário acima.
  }
}

/** Código errado, expirado, consumido e erro de servidor colapsam no mesmo erro genérico. */
async function confirmReset(
  input: Readonly<{ code: string; dependencies: ClientDependencies; password: string }>,
): Promise<void> {
  let response: Response
  try {
    response = await input.dependencies.fetch(
      buildRequest({
        body: { code: input.code, password: input.password },
        path: PASSWORD_RESET_CONFIRM_PATH,
        url: `${input.dependencies.apiBaseUrl}${PASSWORD_RESET_CONFIRM_PATH}`,
      }),
    )
  } catch {
    throw new PasswordResetRejectedError()
  }

  if (!response.ok) throw new PasswordResetRejectedError()
}

export const createPasswordResetClient: PasswordResetClientFactory = (dependencies) => ({
  confirm: (input) => confirmReset({ ...input, dependencies }),
  request: (input) => requestCode({ ...input, dependencies }),
})
