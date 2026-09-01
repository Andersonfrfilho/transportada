/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from './identityEnvironment.config'

/**
 * A etapa é anônima e **não tem token**: ela acontece antes de existir sessão. A resposta é a mesma
 * para quem existe e para quem não existe — o servidor devolve o próprio valor digitado quando não
 * resolve —, então não há nada aqui a interpretar como "não encontrado".
 */
export async function resolveLoginHint(identifier: string): Promise<string> {
  const response = await fetch(`${getIdentityEnvironment().apiBaseUrl}/login-hints`, {
    body: JSON.stringify({ identifier }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) return identifier

  const payload: unknown = await response.json()
  return readLoginHint(payload) ?? identifier
}

function readLoginHint(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) return undefined
  const data: unknown = payload.data
  if (typeof data !== 'object' || data === null || !('loginHint' in data)) return undefined
  return typeof data.loginHint === 'string' && data.loginHint !== '' ? data.loginHint : undefined
}
