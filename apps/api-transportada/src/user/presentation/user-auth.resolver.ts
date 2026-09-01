/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AuthContextResolverPort } from '@adatechnology/module-http'
import type { UserModule } from '@adatechnology/user-module'

const BEARER_PREFIX = 'bearer '

type CreateUserAuthResolverParams = {
  /** Raiz da instalação — o módulo é `tenancy: 'single'`, então todo token dele é desta empresa. */
  readonly companyId: string
  readonly module: UserModule
}

/**
 * O access token aqui não é o do Keycloak — é o que o próprio `user-module` assina (segredo
 * `USER_ACCESS_TOKEN_SECRET`), verificado por `module.verifyAccessToken`. Schema `user` isolado,
 * sessão isolada: uma conta de agregado nunca autentica numa rota do painel, e vice-versa.
 */
export function createUserAuthResolver({
  companyId,
  module,
}: CreateUserAuthResolverParams): AuthContextResolverPort {
  return Object.freeze({
    async resolve({ headers }: { readonly headers: Readonly<Record<string, string>> }) {
      const token = extractBearerToken(headers.authorization)
      if (token === undefined) return undefined

      const claims = await module.verifyAccessToken(token)
      if (claims === undefined) return undefined

      return {
        companyId: claims.companyId ?? companyId,
        scopes: [claims.role],
        userId: claims.sub,
      }
    },
  })
}

function extractBearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined) return undefined
  if (!authorization.toLowerCase().startsWith(BEARER_PREFIX)) return undefined
  const token = authorization.slice(BEARER_PREFIX.length).trim()
  return token.length === 0 ? undefined : token
}
