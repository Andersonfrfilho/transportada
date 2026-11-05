/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HTTP_ERROR } from '../../shared/api.constant'
import { ApiError } from '../../shared/api.error'
import { grantsAnyPermission, SERVICE_ONLY_PERMISSIONS } from '../domain/authorization.policy'
import type { CompanyPermission, RouteAuthorizationPolicy } from '../domain/authorization.policy'
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
    const serviceAccount = context.identity.serviceAccount === true
    if ('anyPermission' in policy) {
      const usable = policy.anyPermission.filter((permission) =>
        isUsableBy({ permission, serviceAccount }),
      )
      if (
        context.scope.kind !== 'company' ||
        !grantsAnyPermission({ granted: context.scope.permissions, required: usable })
      ) {
        throw forbidden()
      }
      return
    }

    if (policy.scope === 'platform') {
      if (serviceAccount) throw forbidden()
      return
    }
    if (
      !isUsableBy({ permission: policy.permission, serviceAccount }) ||
      context.scope.kind !== 'company' ||
      !context.scope.permissions.has(policy.permission)
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

/**
 * ADR-0047, emenda 2026-11-05: permissão de máquina só para token de máquina, e token de máquina só
 * para permissão de máquina. Um papel de serviço dado a uma pessoa por engano, ou um papel de gente
 * dado à membership sintética, não abre nada no lado errado.
 */
function isUsableBy(input: {
  readonly permission: CompanyPermission
  readonly serviceAccount: boolean
}): boolean {
  return SERVICE_ONLY_PERMISSION_SET.has(input.permission) === input.serviceAccount
}

const SERVICE_ONLY_PERMISSION_SET: ReadonlySet<CompanyPermission> = new Set(
  SERVICE_ONLY_PERMISSIONS,
)

function forbidden(): ApiError {
  return new ApiError(HTTP_ERROR.forbidden)
}
