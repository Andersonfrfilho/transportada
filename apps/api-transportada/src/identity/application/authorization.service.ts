/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HTTP_ERROR } from '../../shared/api.constant'
import { ApiError } from '../../shared/api.error'
import type { RouteAuthorizationPolicy } from '../domain/authorization.policy'
import type {
  AuthenticatedContext,
  CompanyContext,
  PlatformContext,
} from '../domain/tenant-context'

type AnyAuthenticatedContext = AuthenticatedContext<CompanyContext | PlatformContext>

export class AuthorizationService {
  public authorize(
    context: AnyAuthenticatedContext,
    policy: RouteAuthorizationPolicy | undefined,
  ): void {
    if (policy === undefined || context.scope.kind !== policy.scope) {
      throw forbidden()
    }
    if ('membership' in policy) {
      if (isNotAPerson(context.identity)) throw forbidden()
      return
    }

    if (
      policy.scope === 'company' &&
      (context.scope.kind !== 'company' || !context.scope.permissions.has(policy.permission))
    ) {
      throw forbidden()
    }
  }
}

/**
 * Spec 144 T005b A1: a política de membership não pede permissão, então quem passa por ela precisa
 * ser gente com token de gente. Service account, plataforma e contexto que já veio de um canal não
 * vinculam número — senão um token de serviço vazado vira credencial de 90 dias que rotação não revoga.
 */
function isNotAPerson(identity: AnyAuthenticatedContext['identity']): boolean {
  return identity.serviceAccount || identity.platformAdmin || identity.channel !== undefined
}

function forbidden(): ApiError {
  return new ApiError(HTTP_ERROR.forbidden)
}
