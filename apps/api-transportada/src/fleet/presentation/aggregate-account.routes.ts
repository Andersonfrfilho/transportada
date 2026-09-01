/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { UserError } from '@adatechnology/user-contracts'
import { buildRefreshTokenCookie } from '@adatechnology/user-module'

import { resolveClientIp } from '../../http/client-ip.service.js'
import { defineAnonymousRoute, type RegisteredAnonymousRoute } from '../../http/router.service.js'
import { ApiError } from '../../shared/api.error.js'
import { API_PUBLIC_AGGREGATE_ACCOUNTS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  AggregateAccountUseCase,
  RegisterAggregateAccountInput,
} from '../application/aggregate-account.use-case.js'
import { parseRegisterAggregateAccountRequest } from './aggregate-account.schema.js'

const ONE_MINUTE_MS = 60_000
/** Cadastro de conta é único por pessoa — 5 a cada 10 minutos por IP cobre erro de digitação sem abrir força bruta. */
const REGISTER_RATE_LIMIT = { maxRequests: 5, windowMs: 10 * ONE_MINUTE_MS } as const

type Dependencies = {
  readonly aggregateAccounts: AggregateAccountUseCase
}

/**
 * Erro do `user-module` chega com `statusCode`/`code`/`message` prontos (`UserError`), mas não é
 * `instanceof ApiError` — o handler global só traduz `ApiError`, então sem isto um e-mail
 * duplicado viraria `500` em vez do `409` que o SDK já calculou.
 */
function toApiError(error: unknown): ApiError {
  if (error instanceof UserError) {
    return new ApiError({ code: error.code, message: error.message, status: error.statusCode })
  }
  if (error instanceof ApiError) return error
  throw error
}

export function createAggregateAccountPublicRoutes(
  dependencies: Dependencies,
): readonly RegisteredAnonymousRoute[] {
  return [
    defineAnonymousRoute<RegisterAggregateAccountInput>({
      async handle({ input }): Promise<Response> {
        try {
          const session = await dependencies.aggregateAccounts.register(input)
          return new Response(JSON.stringify({ data: session }), {
            headers: {
              'content-type': JSON_CONTENT_TYPE,
              'set-cookie': buildRefreshTokenCookie({
                maxAgeSeconds: session.refreshExpiresInSeconds,
                token: session.refreshToken,
              }),
            },
            status: 201,
          })
        } catch (error: unknown) {
          throw toApiError(error)
        }
      },
      method: 'POST',
      parse: async ({ request }) => {
        const body = await parseRegisterAggregateAccountRequest(request)
        return { ...body, ipAddress: resolveClientIp(request) }
      },
      pathname: API_PUBLIC_AGGREGATE_ACCOUNTS_PATH,
      rateLimit: REGISTER_RATE_LIMIT,
    }),
  ]
}
