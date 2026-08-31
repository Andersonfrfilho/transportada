/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { maskIdentityEmail, maskIdentityTaxId } from '../domain/company-user.policy.js'
import {
  reconcileIdentities,
  RECONCILIATION_STATUS,
  RECONCILIATION_VIEW_STATUS,
  type ReconciliationEntry,
  type ReconciliationMatch,
  type ReconciliationViewStatus,
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
/** O quarto estado vem do pacote pela mesma costura dos três de existência (ver o domínio). */
export { RECONCILIATION_VIEW_STATUS, type ReconciliationViewStatus }

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
  readonly status: ReconciliationViewStatus
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
          status: resolveViewStatus(entry),
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
 * Só quem existe nos dois lados pode estar sem perfil: sem conta no provedor não há de onde copiar
 * nome e e-mail, e ali o que importa continua sendo a existência — oferecer "preencher pelo
 * provedor" seria oferecer um botão sem fonte.
 *
 * E não basta casar: é preciso o `subject` **gravado**. Quem casou por e-mail ou documento é palpite
 * do algoritmo, não vínculo escrito — o conserto ali é ligar as duas contas (a sincronização), e
 * preencher a ficha a partir de um casamento que ninguém confirmou seria escrever nome de pessoa com
 * base num palpite.
 */
function resolveViewStatus(entry: ReconciliationEntry): ReconciliationViewStatus {
  if (entry.status !== RECONCILIATION_STATUS.LINKED) return entry.status
  if (entry.local?.subject === undefined) return RECONCILIATION_STATUS.LINKED

  return entry.local.hasProfile
    ? RECONCILIATION_STATUS.LINKED
    : RECONCILIATION_VIEW_STATUS.PROFILE_MISSING
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
