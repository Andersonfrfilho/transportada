/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { maskIdentityEmail, maskIdentityTaxId } from '../../identity/domain/company-user.policy.js'
import type { FleetCompanyContext } from './fleet.port.js'

/**
 * `no-user`: a ficha não tem usuário — nunca foi convidada. `invited`: tem usuário e o convite
 * aguarda o código. `expired`: o convite venceu sem ser usado. Quem já ativou não entra no relatório.
 */
export type FleetDriverAccessState = 'expired' | 'invited' | 'no-user'

export type FleetDriverAccessRow = {
  readonly contact: string
  readonly deliveredAt: string | null
  readonly driverId: string
  readonly expiresAt: string | null
  readonly name: string
  readonly state: FleetDriverAccessState
  readonly taxId: string
  /** Presente quando há usuário: é por ele que "Reenviar" age. */
  readonly userId: string | null
}

/** O que o banco devolve por ficha ativa; o mascaramento e o estado são decididos aqui. */
export type FleetDriverAccessSource = {
  readonly email: string
  readonly driverId: string
  readonly invitation: {
    readonly acceptedAt: Date | null
    readonly deliveredAt: Date | null
    readonly expiresAt: Date
    readonly status: string
  } | null
  readonly name: string
  readonly phone: string
  readonly taxId: string
  readonly userId: string | null
}

export type FleetDriverAccessReportPort = {
  listActiveDrivers(input: {
    readonly companyId: string
  }): Promise<readonly FleetDriverAccessSource[]>
}

export type FleetDriverAccessReportUseCase = {
  execute(input: {
    readonly context: FleetCompanyContext
  }): Promise<readonly FleetDriverAccessRow[]>
}

export function resolveFleetDriverAccessState(input: {
  readonly now: Date
  readonly source: FleetDriverAccessSource
}): FleetDriverAccessState | null {
  const { now, source } = input
  if (source.userId === null) return 'no-user'
  const invitation = source.invitation
  if (invitation === null) return null
  if (invitation.status === 'accepted' || invitation.acceptedAt !== null) return null
  return invitation.expiresAt.getTime() <= now.getTime() ? 'expired' : 'invited'
}

/**
 * ⚠️ **A conferência de usuários só enxerga quem já tem usuário.** Ficha ativa sem usuário (candidatura
 * aprovada antes do convite automático, convite que falhou) ficava invisível nela, e o motorista
 * esperava um acesso que ninguém sabia que faltava. Este relatório parte da ficha, não do usuário.
 */
export function createFleetDriverAccessReportUseCase(dependencies: {
  readonly clock?: () => Date
  readonly port: FleetDriverAccessReportPort
}): FleetDriverAccessReportUseCase {
  const clock = dependencies.clock ?? (() => new Date())

  return {
    async execute({ context }) {
      const sources = await dependencies.port.listActiveDrivers({ companyId: context.companyId })
      const now = clock()

      return sources.flatMap((source) => {
        const state = resolveFleetDriverAccessState({ now, source })
        if (state === null) return []
        return [
          {
            contact:
              source.email === ''
                ? maskIdentityTaxId(source.phone)
                : maskIdentityEmail(source.email),
            deliveredAt: source.invitation?.deliveredAt?.toISOString() ?? null,
            driverId: source.driverId,
            expiresAt: source.invitation?.expiresAt.toISOString() ?? null,
            name: source.name,
            state,
            taxId: maskIdentityTaxId(source.taxId),
            userId: source.userId,
          },
        ]
      })
    },
  }
}
