/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { maskIdentityEmail, maskIdentityTaxId } from '../domain/company-user.policy.js'
import {
  reconcileIdentities,
  type ReconciliationMatch,
  type ReconciliationStatus,
} from '../domain/user-reconciliation.policy.js'
import type { IdentityAccessGatewayPort } from '../infrastructure/keycloak-admin.gateway.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'

type ReconcileCompanyUsersDependencies = {
  readonly gateway: Pick<IdentityAccessGatewayPort, 'listUsers'>
  readonly repository: Pick<CompanyUserRepositoryPort, 'listForReconciliation'>
}

export type ReconcileCompanyUsersInput = {
  readonly context: { readonly companyId: string }
  readonly limit: number
}

/**
 * O valor cru é o que a regra casa; o que sai daqui é mascarado, como na listagem — a tela serve
 * para reconhecer a pessoa e decidir, não para exportar a ficha dela.
 */
export type ReconciliationEntryView = {
  readonly local?: {
    /** O que o convite gravou: é onde o e-mail mora na maioria das contas. */
    readonly contact: string
    readonly email: string
    readonly membershipId: string
    readonly name: string
    readonly taxId: string
    readonly userId: string
  }
  readonly matchedBy: ReconciliationMatch
  readonly realm?: {
    readonly email: string
    readonly enabled: boolean
    readonly subject: string
    readonly username: string
  }
  readonly status: ReconciliationStatus
}

export type ReconcileCompanyUsersResult = {
  /** Do realm, não da empresa: há mais conta no Keycloak do que a página trouxe. */
  readonly hasMoreRealmUsers: boolean
  readonly items: readonly ReconciliationEntryView[]
}

export type ReconcileCompanyUsersUseCase = {
  execute(input: ReconcileCompanyUsersInput): Promise<ReconcileCompanyUsersResult>
}

export function createReconcileCompanyUsersUseCase({
  gateway,
  repository,
}: ReconcileCompanyUsersDependencies): ReconcileCompanyUsersUseCase {
  return {
    async execute({ context, limit }) {
      const [local, realm] = await Promise.all([
        repository.listForReconciliation({ companyId: context.companyId }),
        gateway.listUsers({ limit }),
      ])

      const entries = reconcileIdentities({ local, realm: realm.users })

      return {
        hasMoreRealmUsers: realm.hasMore,
        items: entries.map((entry) => ({
          matchedBy: entry.matchedBy,
          status: entry.status,
          ...(entry.local === undefined
            ? {}
            : {
                local: {
                  contact: maskIdentityContact(entry.local),
                  email: maskIdentityEmail(entry.local.email),
                  membershipId: entry.local.membershipId,
                  name: entry.local.name,
                  taxId: maskIdentityTaxId(entry.local.taxId),
                  userId: entry.local.userId,
                },
              }),
          ...(entry.realm === undefined
            ? {}
            : {
                realm: {
                  email: maskIdentityEmail(entry.realm.email),
                  enabled: entry.realm.enabled,
                  subject: entry.realm.subject,
                  username: entry.realm.username,
                },
              }),
        })),
      }
    },
  }
}

/**
 * A coluna "Aqui" precisa mostrar o que existe do nosso lado, e o que existe é o contato — a coluna
 * `email` fica vazia na maioria das contas. Mascarar telefone como e-mail produziria `1***@`, então
 * cada canal usa a máscara dele.
 */
function maskIdentityContact(
  record: Readonly<{ contactAddress: string; contactChannel: string; email: string }>,
): string {
  if (record.contactChannel === 'email') return maskIdentityEmail(record.contactAddress)
  return maskIdentityTaxId(record.contactAddress)
}
