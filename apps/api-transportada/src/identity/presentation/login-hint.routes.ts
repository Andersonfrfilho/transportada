/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RateLimitCeiling } from '../../http/rate-limiter.service.js'
import { defineAnonymousRoute } from '../../http/router.service.js'
import { API_LOGIN_HINTS_PATH, HTTP_ERROR, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import type { ResolveLoginHintUseCase } from '../application/resolve-login-hint.use-case.js'

/** O campo de login não é um endereço nem um documento: é o que a pessoa lembra. */
const MAX_IDENTIFIER_LENGTH = 254

type Dependencies = {
  readonly rateLimit: RateLimitCeiling
  readonly resolveLoginHint: ResolveLoginHintUseCase
}

/**
 * A primeira etapa do login, e a **única** coisa que ela faz é dizer ao provedor qual login é aquele.
 * A senha nunca passa por aqui: ela continua indo direto ao Keycloak, no fluxo de browser, com PKCE.
 *
 * A rota é anônima porque acontece antes de existir sessão — e é justamente por isso que ela
 * **responde igual para quem existe e para quem não existe**. Dizer "não encontrado" entregaria a
 * base de e-mails, CPFs e telefones a quem tivesse um script; o produto já tomou essa decisão em
 * `POST /password-resets`, que responde 204 sempre pelo mesmo motivo.
 *
 * O teto é só por IP (ADR-0076 §3): um teto por alvo daria a um terceiro o poder de trancar a
 * primeira etapa do login de qualquer pessoa, bastando saber o e-mail dela.
 */
export function createLoginHintRoutes(dependencies: Dependencies) {
  return [
    defineAnonymousRoute<{ readonly identifier: string }>({
      async handle({ input }): Promise<Response> {
        const { loginHint } = await dependencies.resolveLoginHint.execute({
          typed: input.identifier,
        })

        /** Só o palpite. `matched` fica no servidor — publicá-lo seria dizer quem existe. */
        return new Response(JSON.stringify({ data: { loginHint } }), {
          headers: { 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'POST',
      async parse({ request }): Promise<{ readonly identifier: string }> {
        const body: unknown = await request.json().catch(() => {
          throw new ApiError(HTTP_ERROR.invalidRequest)
        })
        if (
          typeof body !== 'object' ||
          body === null ||
          !('identifier' in body) ||
          typeof body.identifier !== 'string' ||
          body.identifier.trim() === '' ||
          body.identifier.length > MAX_IDENTIFIER_LENGTH
        ) {
          throw new ApiError(HTTP_ERROR.invalidRequest)
        }

        return { identifier: body.identifier }
      },
      pathname: API_LOGIN_HINTS_PATH,
      rateLimit: { ...dependencies.rateLimit, scope: 'login-hints-ip', store: 'postgres' },
    }),
  ]
}
