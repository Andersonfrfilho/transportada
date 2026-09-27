/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ConfirmPasswordResetUseCase } from '../application/confirm-password-reset.use-case.js'
import type { RequestPasswordResetUseCase } from '../application/request-password-reset.use-case.js'
import type { RateLimitCeiling } from '../../http/rate-limiter.service.js'
import { defineAnonymousRoute } from '../../http/router.service.js'
import { normalizeRateLimitTarget } from '../domain/login-identifier.policy.js'
import {
  API_PASSWORD_RESET_CONFIRM_PATH,
  API_PASSWORD_RESETS_PATH,
  HTTP_ERROR,
} from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import {
  parseConfirmPasswordResetRequest,
  parseRequestPasswordResetRequest,
  type ConfirmPasswordResetRequest,
  type RequestPasswordResetRequest,
} from './password-reset.schema.js'

type Dependencies = {
  readonly confirmPasswordReset: ConfirmPasswordResetUseCase
  readonly rateLimits: {
    readonly confirmIp: RateLimitCeiling
    readonly requestIp: RateLimitCeiling
    readonly requestTarget: RateLimitCeiling
  }
  readonly requestPasswordReset: RequestPasswordResetUseCase
}

export function createPasswordResetRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineAnonymousRoute>[] {
  return [
    defineAnonymousRoute<RequestPasswordResetRequest>({
      async handle({ input }): Promise<Response> {
        await dependencies.requestPasswordReset.execute(input)
        return new Response(null, { status: 204 })
      },
      method: 'POST',
      async parse({ request }): Promise<RequestPasswordResetRequest> {
        return parseRequestPasswordResetRequest(await parseJsonBody(request))
      },
      pathname: API_PASSWORD_RESETS_PATH,
      /**
       * Spec 191 RF12: o pedido dispara envio, então conta por IP e pelo alvo. O alvo é o texto
       * digitado, não o usuário resolvido — o 429 sai igual para quem existe e para quem não existe.
       */
      rateLimit: {
        ...dependencies.rateLimits.requestIp,
        scope: 'password-resets-ip',
        store: 'postgres',
        target: {
          ...dependencies.rateLimits.requestTarget,
          key: (input) => normalizeRateLimitTarget(input.username),
          scope: 'password-resets-target',
        },
      },
    }),
    defineAnonymousRoute<ConfirmPasswordResetRequest>({
      async handle({ input }): Promise<Response> {
        await dependencies.confirmPasswordReset.execute(input)
        return new Response(null, { status: 204 })
      },
      method: 'POST',
      async parse({ request }): Promise<ConfirmPasswordResetRequest> {
        return parseConfirmPasswordResetRequest(await parseJsonBody(request))
      },
      pathname: API_PASSWORD_RESET_CONFIRM_PATH,
      /** Só IP: como na ativação, o que protege o código é a entropia dele somada a este teto. */
      rateLimit: {
        ...dependencies.rateLimits.confirmIp,
        scope: 'password-resets-confirm-ip',
        store: 'postgres',
      },
    }),
  ]
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new ApiError(HTTP_ERROR.invalidRequest)
  }
}
