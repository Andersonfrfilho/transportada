/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FetchLike } from '@adatechnology/keycloak-admin'

/** `/admin/realms/<realm>/users/<id>` sem sufixo: é o recurso da conta, não senha nem grupo. */
const USER_RESOURCE_PATTERN = /\/admin\/realms\/[^/]+\/users\/[^/?#]+$/u

/**
 * O Keycloak 26, com perfil de usuário declarativo, trata `PUT /users/:id` com `attributes` como a
 * ficha inteira: sem `username` recusa com 400 ("User name is missing"), e com o `username` mas sem
 * e-mail e nome **apaga** os dois. Reproduzido na 26.5.2 com o realm de produção em 16/09/2026.
 *
 * O pacote manda só `{ attributes }` em `updateAttributes` e `setProfilePicture`. Aqui a regravação
 * parcial de atributos vira leitura da conta + regravação da representação completa, com os
 * atributos trocados — a única forma que o provedor aceita sem perder campo.
 */
export function createFullRepresentationFetch(baseFetch: FetchLike): FetchLike {
  return async (input, init) => {
    const partialAttributes = readPartialAttributesUpdate(input, init)
    if (partialAttributes === undefined) return baseFetch(input, init)

    const current = await baseFetch(input, { headers: init?.headers ?? {}, method: 'GET' })
    if (!current.ok) return current

    const representation = (await current.json()) as Record<string, unknown>
    return baseFetch(input, {
      ...init,
      body: JSON.stringify({ ...representation, ...partialAttributes }),
    })
  }
}

function readPartialAttributesUpdate(
  input: Parameters<FetchLike>[0],
  init: RequestInit | undefined,
): Record<string, unknown> | undefined {
  if (init?.method !== 'PUT' || typeof init.body !== 'string') return undefined
  if (!USER_RESOURCE_PATTERN.test(String(input))) return undefined

  const body: unknown = JSON.parse(init.body)
  if (typeof body !== 'object' || body === null || !('attributes' in body)) return undefined
  if ('username' in body) return undefined
  return body as Record<string, unknown>
}
