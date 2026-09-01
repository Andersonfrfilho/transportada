/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GroupAuditPort } from './company-group.audit.port.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import type { IdentityAccessGatewayPort } from '../infrastructure/keycloak-admin.gateway.js'

type Actor = { readonly companyId: string; readonly userId: string }

type SynchronizeIdentitiesDependencies = {
  readonly audit: GroupAuditPort
  readonly gateway: Pick<IdentityAccessGatewayPort, 'createUser' | 'listUsers'>
  readonly issuer: string
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    'createInvitedUser' | 'findIdentitySubject' | 'linkIdentitySubject' | 'listForReconciliation'
  >
}

export type SynchronizeIdentitiesInput = {
  readonly context: Actor
  readonly correlationId: string
  /** Contas do provedor a trazer para cá. */
  readonly subjects: readonly string[]
  /** Vínculos daqui a criar no provedor. */
  readonly userIds: readonly string[]
}

export type SynchronizeIdentitiesResult = {
  readonly createdLocally: readonly string[]
  readonly createdInRealm: readonly string[]
  /** Quem foi recusado, e por quê — silenciar faria o operador achar que sincronizou. */
  readonly skipped: readonly { readonly reason: string; readonly subject: string }[]
}

/**
 * Conta de serviço não é gente. O realm tem robôs — o service account do próprio produto, e o de
 * qualquer outro cliente do mesmo realm —, e importá-los daria membership de empresa a um processo.
 * O prefixo é a convenção do Keycloak, e é por ela que se reconhece um.
 */
const SERVICE_ACCOUNT_PREFIX = 'service-account-'

export const SYNC_SKIP_REASON = {
  ALREADY_LINKED: 'already-linked',
  NOT_FOUND: 'not-found',
  SERVICE_ACCOUNT: 'service-account',
} as const

export type SynchronizeIdentitiesUseCase = {
  execute(input: SynchronizeIdentitiesInput): Promise<SynchronizeIdentitiesResult>
}

/**
 * Criar quem falta, nos dois sentidos — e **nunca em bloco cego**. O chamador diz exatamente quem
 * trazer e quem levar: uma varredura que importasse todo o realm colocaria dentro da empresa cada
 * conta que existe no provedor, incluindo as de outros produtos que compartilham o mesmo realm.
 *
 * Quem nasce aqui vindo do provedor nasce **sem papel nenhum**: existe, aparece na listagem, e não
 * alcança nada até alguém decidir o que ela faz. Importar já concedendo seria transformar um botão
 * de conserto num caminho de concessão silenciosa.
 */
export function createSynchronizeIdentitiesUseCase({
  audit,
  gateway,
  issuer,
  repository,
}: SynchronizeIdentitiesDependencies): SynchronizeIdentitiesUseCase {
  return {
    async execute({ context, correlationId, subjects, userIds }) {
      const createdInRealm = await createMissingRealmUsers({
        companyId: context.companyId,
        gateway,
        issuer,
        repository,
        userIds,
      })
      const imported = await importRealmAccounts({
        companyId: context.companyId,
        gateway,
        issuer,
        repository,
        subjects,
      })

      if (createdInRealm.length > 0) {
        await audit.record({
          action: 'company-user.realm-account.created',
          actorUserId: context.userId,
          companyId: context.companyId,
          correlationId,
          targetIds: [...createdInRealm],
        })
      }
      if (imported.created.length > 0) {
        await audit.record({
          action: 'company-user.imported-from-realm',
          actorUserId: context.userId,
          companyId: context.companyId,
          correlationId,
          targetIds: [...imported.created],
        })
      }

      return {
        createdInRealm,
        createdLocally: imported.created,
        skipped: imported.skipped,
      }
    },
  }
}

/**
 * Vínculo daqui sem conta lá: cria a conta **desabilitada**, como o convite faz. Habilitar sem a
 * pessoa ter escolhido senha abriria acesso que ninguém pediu — o caminho de ativação continua sendo
 * o convite.
 */
async function createMissingRealmUsers(input: {
  readonly companyId: string
  readonly gateway: Pick<IdentityAccessGatewayPort, 'createUser'>
  readonly issuer: string
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    'findIdentitySubject' | 'linkIdentitySubject' | 'listForReconciliation'
  >
  readonly userIds: readonly string[]
}): Promise<readonly string[]> {
  if (input.userIds.length === 0) return []

  const local = await input.repository.listForReconciliation({ companyId: input.companyId })
  const created: string[] = []

  for (const userId of input.userIds) {
    const record = local.find((entry) => entry.userId === userId)
    if (record === undefined || record.subject !== undefined) continue

    const email = record.contactChannel === 'email' ? record.contactAddress : record.email
    const { subject } = await input.gateway.createUser({
      email: email === '' ? `${userId}@users.invalid` : email,
      enabled: false,
      username: userId,
    })
    await input.repository.linkIdentitySubject({ issuer: input.issuer, subject, userId })
    created.push(userId)
  }

  return created
}

async function importRealmAccounts(input: {
  readonly companyId: string
  readonly gateway: Pick<IdentityAccessGatewayPort, 'listUsers'>
  readonly issuer: string
  readonly repository: Pick<CompanyUserRepositoryPort, 'createInvitedUser'>
  readonly subjects: readonly string[]
}): Promise<{
  readonly created: readonly string[]
  readonly skipped: readonly { readonly reason: string; readonly subject: string }[]
}> {
  if (input.subjects.length === 0) return { created: [], skipped: [] }

  const realm = await input.gateway.listUsers({ limit: 200 })
  const created: string[] = []
  const skipped: { reason: string; subject: string }[] = []

  for (const subject of input.subjects) {
    const account = realm.users.find((user) => user.subject === subject)
    if (account === undefined) {
      skipped.push({ reason: SYNC_SKIP_REASON.NOT_FOUND, subject })
      continue
    }
    if (account.username.startsWith(SERVICE_ACCOUNT_PREFIX)) {
      skipped.push({ reason: SYNC_SKIP_REASON.SERVICE_ACCOUNT, subject })
      continue
    }

    const userId = crypto.randomUUID()
    await input.repository.createInvitedUser({
      companyId: input.companyId,
      contactAddress: account.email,
      contactChannel: 'email',
      email: account.email,
      issuer: input.issuer,
      name: account.username,
      phone: '',
      /** Sem papel: existe, aparece, e não alcança nada até alguém decidir o que ela faz. */
      roles: [],
      subject,
      taxId: account.taxId,
      userId,
      username: account.username,
    })
    created.push(userId)
  }

  return { created, skipped }
}
