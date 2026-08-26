/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

type TurnstileVerifyResponse = { readonly success: boolean }

/**
 * Falha de rede ou resposta inesperada do Cloudflare conta como token inválido — nunca como
 * "não deu pra checar, deixa passar". Um captcha que abre exceção na primeira instabilidade da
 * dependência externa não é captcha, é decoração.
 */
export async function verifyTurnstileToken(input: {
  readonly remoteIp?: string
  readonly secretKey: string
  readonly token: string
}): Promise<boolean> {
  if (input.token.trim().length === 0) return false

  try {
    const body = new URLSearchParams({ response: input.token, secret: input.secretKey })
    if (input.remoteIp !== undefined) body.set('remoteip', input.remoteIp)

    const response = await fetch(TURNSTILE_VERIFY_URL, { body, method: 'POST' })
    if (!response.ok) return false

    const result = (await response.json()) as TurnstileVerifyResponse
    return result.success === true
  } catch {
    return false
  }
}
