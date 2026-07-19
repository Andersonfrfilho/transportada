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

    if (
      policy.scope === 'company' &&
      (context.scope.kind !== 'company' || !context.scope.permissions.has(policy.permission))
    ) {
      throw forbidden()
    }
  }
}

function forbidden(): ApiError {
  return new ApiError(HTTP_ERROR.forbidden)
}
