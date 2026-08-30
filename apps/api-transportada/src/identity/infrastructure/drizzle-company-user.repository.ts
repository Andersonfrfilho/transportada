/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm'

import { fleetDrivers } from '../../database/fleet.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import { jobExecutions, jobSchedules } from '../../database/job-schedule.schema.js'
import type { JobOutcome, ScheduledJob } from '../../shared/job-catalog.constant.js'
import type { RevealedCompanyUser } from '../application/reveal-company-users.use-case.js'
import { SYSTEM_DISTRIBUTION_ACTOR_USER_ID } from '../domain/system-distribution-actor.constant.js'
import type { LocalIdentityRecord } from '../domain/user-reconciliation.policy.js'
import {
  externalIdentities,
  identityUserProfiles,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
  userInvitations,
} from '../../database/database.schema.js'
import type { CompanyRole, MembershipStatus } from '../../database/identity.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import { DuplicateTaxIdError, DuplicateUsernameError } from '../domain/company-user.error.js'
import { buildCompanyAdministratorFilters } from './drizzle-invitation.repository.js'
import type {
  CompanyUserPage,
  CompanyUserRecord,
  CompanyUserRepositoryPort,
  CreateInvitedUserInput,
  CreateInvitedUserResult,
  ListCompanyUsersInput,
  UpdateCompanyUserProfileInput,
} from '../application/company-user.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * As colunas do perfil chegam anuláveis porque a listagem o alcança por `leftJoin`: vínculo sem
 * perfil é estado que existe na base, e declará-las não-nulas aqui era o que fazia o `innerJoin`
 * parecer seguro enquanto escondia gente da tela.
 */
type MembershipRow = {
  readonly contactAddress: string | null
  readonly contactChannel: CompanyUserRecord['contactChannel'] | null
  readonly email: string | null
  readonly membershipCreatedAt: Date
  readonly membershipId: string
  readonly membershipStatus: MembershipStatus
  readonly name: string | null
  readonly phone: string | null
  readonly taxId: string | null
  readonly userId: string
  readonly username: string | null
}

const MEMBERSHIP_COLUMNS = {
  contactAddress: identityUserProfiles.contactAddress,
  contactChannel: identityUserProfiles.contactChannel,
  email: identityUserProfiles.email,
  membershipCreatedAt: userCompanyMemberships.createdAt,
  membershipId: userCompanyMemberships.id,
  membershipStatus: userCompanyMemberships.status,
  name: identityUserProfiles.name,
  phone: identityUserProfiles.phone,
  taxId: identityUserProfiles.taxId,
  userId: userCompanyMemberships.userId,
  username: identityUserProfiles.username,
} as const

/**
 * O ator sintético da distribuição de NF-e é identidade de sistema, não pessoa: ele tem membership
 * para manter as colunas de ator NOT NULL, e a constante que o declara manda excluí-lo de toda
 * listagem de gente. O `leftJoin` o trouxe para a tela — antes o `innerJoin` o escondia por acidente,
 * porque ele também não tem perfil.
 */
function isRealPerson() {
  return ne(userCompanyMemberships.userId, SYSTEM_DISTRIBUTION_ACTOR_USER_ID)
}

const CONTACT_REVEAL_ACTION = 'company-user.contact.revealed'
const CONTACT_REVEAL_ENTITY = 'company-user'
const CONTACT_REVEAL_PERMISSION = 'users.reveal'

/** Canal de um perfil que não existe: não há contato, e o formato precisa de um valor. */
const DEFAULT_CONTACT_CHANNEL = 'email' as const

const TAX_ID_CONSTRAINT = 'identity_user_profiles_tax_id_unique'

/** Papéis cuja pessoa tem ficha em `fleet_drivers` — é por eles que o vínculo é procurado. */
const FLEET_LINKED_ROLES: readonly CompanyRole[] = ['driver', 'aggregate']

const USERNAME_CONSTRAINT = 'identity_user_profiles_username_key'

export class DrizzleCompanyUserRepository implements CompanyUserRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async createInvitedUser(input: CreateInvitedUserInput): Promise<CreateInvitedUserResult> {
    const membershipId = crypto.randomUUID()
    let linkedFleetDriverId: string | null = null
    await this.database.transaction(async (transaction) => {
      await transaction.insert(identityUsers).values({ id: input.userId, status: 'active' })
      await transaction.insert(externalIdentities).values({
        id: crypto.randomUUID(),
        issuer: input.issuer,
        subject: input.subject,
        userId: input.userId,
      })
      await transaction.insert(userCompanyMemberships).values({
        companyId: input.companyId,
        id: membershipId,
        status: 'active',
        userId: input.userId,
      })

      if (input.roles.length > 0) {
        await transaction.insert(membershipRoles).values(
          input.roles.map((role) => ({
            membershipId,
            role,
          })),
        )
      }
      await transaction.insert(identityUserProfiles).values({
        contactAddress: input.contactAddress,
        contactChannel: input.contactChannel,
        email: input.email,
        name: input.name,
        phone: input.phone,
        taxId: input.taxId,
        userId: input.userId,
        username: input.username,
      })

      linkedFleetDriverId = await linkFleetDriver(transaction, { ...input, membershipId })
    })
    return { linkedFleetDriverId, membershipId }
  }

  public async findByUserId(input: {
    readonly companyId: string
    readonly userId: string
  }): Promise<CompanyUserRecord | undefined> {
    const [row] = await this.database
      .select(MEMBERSHIP_COLUMNS)
      .from(userCompanyMemberships)
      .innerJoin(
        identityUserProfiles,
        eq(identityUserProfiles.userId, userCompanyMemberships.userId),
      )
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.userId, input.userId),
        ),
      )
      .limit(1)
    if (row === undefined) return undefined

    const [roles, pendingInvitations] = await Promise.all([
      this.fetchRoles({ companyId: input.companyId, userIds: [input.userId] }),
      this.fetchPendingInvitations({ companyId: input.companyId, userIds: [input.userId] }),
    ])

    return toRecord(row, roles, pendingInvitations)
  }

  /** O Admin API do Keycloak só entende o `subject`; o id interno não existe do lado de lá. */
  public async findIdentitySubject(input: {
    readonly userId: string
  }): Promise<string | undefined> {
    const [row] = await this.database
      .select({ subject: externalIdentities.subject })
      .from(externalIdentities)
      .where(eq(externalIdentities.userId, input.userId))
      .limit(1)
    return row?.subject
  }

  /** Desabilitar no provedor é global: só pode acontecer quando não sobra vínculo ativo nenhum. */
  public async listActiveMembershipCompanyIds(input: {
    readonly userId: string
  }): Promise<readonly string[]> {
    const rows = await this.database
      .select({ companyId: userCompanyMemberships.companyId })
      .from(userCompanyMemberships)
      .where(
        and(
          eq(userCompanyMemberships.userId, input.userId),
          eq(userCompanyMemberships.status, 'active'),
        ),
      )
    return rows.map((row) => row.companyId)
  }

  public async listAdministratorUserIds(input: {
    readonly companyId: string
  }): Promise<readonly string[]> {
    const rows = await this.database
      .select({ userId: userCompanyMemberships.userId })
      .from(userCompanyMemberships)
      .innerJoin(membershipRoles, eq(membershipRoles.membershipId, userCompanyMemberships.id))
      .where(and(...buildCompanyAdministratorFilters(input)))

    return rows.map((row) => row.userId)
  }

  /**
   * O `leftJoin` no perfil não é preferência de estilo: com `innerJoin`, membership cujo perfil
   * ainda não existe — conta criada antes de o perfil passar a ser gravado — desaparece da leitura,
   * e some justamente da tela feita para encontrá-la.
   */
  public async listForReconciliation(input: {
    readonly companyId: string
  }): Promise<readonly LocalIdentityRecord[]> {
    const rows = await this.database
      .select({
        contactAddress: identityUserProfiles.contactAddress,
        contactChannel: identityUserProfiles.contactChannel,
        email: identityUserProfiles.email,
        membershipId: userCompanyMemberships.id,
        name: identityUserProfiles.name,
        subject: externalIdentities.subject,
        taxId: identityUserProfiles.taxId,
        userId: userCompanyMemberships.userId,
      })
      .from(userCompanyMemberships)
      .leftJoin(
        identityUserProfiles,
        eq(identityUserProfiles.userId, userCompanyMemberships.userId),
      )
      .leftJoin(externalIdentities, eq(externalIdentities.userId, userCompanyMemberships.userId))
      .where(and(eq(userCompanyMemberships.companyId, input.companyId), isRealPerson()))

    return rows.map((row) => ({
      contactAddress: row.contactAddress ?? '',
      contactChannel: row.contactChannel ?? DEFAULT_CONTACT_CHANNEL,
      email: row.email ?? '',
      membershipId: row.membershipId,
      name: row.name ?? '',
      taxId: row.taxId ?? '',
      userId: row.userId,
      ...(row.subject === null ? {} : { subject: row.subject }),
    }))
  }

  /**
   * Mesmo padrão do disparo manual da importação: a linha do histórico e o adiamento da janela vão
   * juntos. Gravar o clique sem reagendar deixaria a janela seguinte vencer minutos depois e repetir
   * o que o operador acabou de pedir.
   */
  public async recordManualJobRun(input: {
    readonly companyId: string
    readonly correlationId: string
    readonly counters: Readonly<Record<string, number>>
    readonly job: ScheduledJob
    readonly outcome: JobOutcome
    readonly requestedBy: string
  }): Promise<void> {
    const startedAt = new Date()
    await this.database.insert(jobExecutions).values({
      companyId: input.companyId,
      correlationId: input.correlationId,
      counters: input.counters,
      finishedAt: startedAt,
      job: input.job,
      origin: 'manual',
      outcome: input.outcome,
      requestedBy: input.requestedBy,
      startedAt,
    })
    await this.database
      .update(jobSchedules)
      .set({
        nextRunAt: sql`now() + make_interval(secs => ${jobSchedules.intervalSeconds})`,
        updatedAt: startedAt,
      })
      .where(eq(jobSchedules.job, input.job))
  }

  /**
   * `leftJoin`, e não `innerJoin`: quem tem vínculo com a empresa mas ainda não tem linha de perfil
   * — conta criada antes de o perfil passar a ser gravado — sumia da listagem inteira. Ela entra e
   * sai do sistema, aparece no token, administra usuários, e não se via na tela que a administra.
   *
   * O perfil ausente vira campo vazio, nunca linha escondida: a tela mostra que a pessoa existe e
   * que falta cadastro, e é assim que alguém a conserta. Esconder é o defeito, não a proteção.
   */
  public async findForReveal(input: {
    readonly companyId: string
    readonly userIds: readonly string[]
  }): Promise<readonly RevealedCompanyUser[]> {
    if (input.userIds.length === 0) return []

    return this.database
      .select({
        email: identityUserProfiles.email,
        name: identityUserProfiles.name,
        phone: identityUserProfiles.phone,
        taxId: identityUserProfiles.taxId,
        userId: identityUserProfiles.userId,
      })
      .from(identityUserProfiles)
      .innerJoin(
        userCompanyMemberships,
        eq(userCompanyMemberships.userId, identityUserProfiles.userId),
      )
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          inArray(identityUserProfiles.userId, [...input.userIds]),
        ),
      )
  }

  /**
   * Uma linha por pessoa revelada. `security.md` §10 pede ator, alvo e horário — o IP fica de fora
   * porque a tabela não o tem, e inventar coluna aqui é decisão maior que este botão.
   */
  public async recordContactReveal(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly correlationId: string
    readonly targetUserIds: readonly string[]
  }): Promise<void> {
    if (input.targetUserIds.length === 0) return

    await this.database.insert(auditLogs).values(
      input.targetUserIds.map((targetUserId) => ({
        action: CONTACT_REVEAL_ACTION,
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        correlationId: input.correlationId,
        entityId: targetUserId,
        entityType: CONTACT_REVEAL_ENTITY,
        permission: CONTACT_REVEAL_PERMISSION,
        targetId: targetUserId,
        targetType: CONTACT_REVEAL_ENTITY,
      })),
    )
  }

  public async listPage(input: ListCompanyUsersInput): Promise<CompanyUserPage> {
    const cursor = decodeCursor(input.cursor)
    const rows = await this.database
      .select(MEMBERSHIP_COLUMNS)
      .from(userCompanyMemberships)
      .leftJoin(
        identityUserProfiles,
        eq(identityUserProfiles.userId, userCompanyMemberships.userId),
      )
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          isRealPerson(),
          cursor === null
            ? undefined
            : or(
                lt(userCompanyMemberships.createdAt, cursor.createdAt),
                and(
                  eq(userCompanyMemberships.createdAt, cursor.createdAt),
                  lt(userCompanyMemberships.id, cursor.id),
                ),
              ),
        ),
      )
      .orderBy(desc(userCompanyMemberships.createdAt), desc(userCompanyMemberships.id))
      .limit(input.limit + 1)

    const pageRows = rows.slice(0, input.limit)
    const userIds = pageRows.map((row) => row.userId)
    const [roles, pendingInvitations] = await Promise.all([
      this.fetchRoles({ companyId: input.companyId, userIds }),
      this.fetchPendingInvitations({ companyId: input.companyId, userIds }),
    ])

    const items = pageRows.map((row) => toRecord(row, roles, pendingInvitations))
    const last = pageRows.at(-1)
    return {
      items,
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? `${last.membershipCreatedAt.toISOString()}::${last.membershipId}`
          : null,
    }
  }

  public async removeMembership(input: {
    readonly companyId: string
    readonly userId: string
  }): Promise<void> {
    await this.database
      .delete(userCompanyMemberships)
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.userId, input.userId),
        ),
      )
  }

  /**
   * Acrescenta, não troca: `on conflict do nothing` sobre a PK `(membership_id, role)` faz o "quem
   * já tem, ignora" ser garantia do banco, não laço em memória — repetir o mesmo lote converge, e
   * duas pessoas aplicando ao mesmo tempo não derrubam uma à outra.
   *
   * Usuário que não pertence à empresa some do lote em vez de virar erro: o `where` do `select` é o
   * recorte, e responder diferente diria ao chamador que aquele id existe em outro lugar.
   */
  public async addRoles(input: {
    readonly companyId: string
    readonly roles: readonly CompanyRole[]
    readonly userIds: readonly string[]
  }): Promise<{ readonly affectedUserIds: readonly string[] }> {
    if (input.roles.length === 0 || input.userIds.length === 0) return { affectedUserIds: [] }

    const memberships = await this.database
      .select({ id: userCompanyMemberships.id, userId: userCompanyMemberships.userId })
      .from(userCompanyMemberships)
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          inArray(userCompanyMemberships.userId, [...input.userIds]),
          isRealPerson(),
        ),
      )
    if (memberships.length === 0) return { affectedUserIds: [] }

    await this.database
      .insert(membershipRoles)
      .values(
        memberships.flatMap((membership) =>
          input.roles.map((role) => ({ membershipId: membership.id, role })),
        ),
      )
      .onConflictDoNothing()

    return { affectedUserIds: memberships.map((membership) => membership.userId) }
  }

  public async replaceRoles(input: {
    readonly companyId: string
    readonly roles: readonly CompanyRole[]
    readonly userId: string
  }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const [membership] = await transaction
        .select({ id: userCompanyMemberships.id })
        .from(userCompanyMemberships)
        .where(
          and(
            eq(userCompanyMemberships.companyId, input.companyId),
            eq(userCompanyMemberships.userId, input.userId),
          ),
        )
        .limit(1)
      if (membership === undefined) return

      await transaction
        .delete(membershipRoles)
        .where(eq(membershipRoles.membershipId, membership.id))
      if (input.roles.length > 0) {
        await transaction
          .insert(membershipRoles)
          .values(input.roles.map((role) => ({ membershipId: membership.id, role })))
      }
    })
  }

  public async setMembershipStatus(input: {
    readonly companyId: string
    readonly status: MembershipStatus
    readonly userId: string
  }): Promise<void> {
    await this.database
      .update(userCompanyMemberships)
      .set({ status: input.status, updatedAt: new Date() })
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.userId, input.userId),
        ),
      )
  }

  /** O `username` é único no realm inteiro: a colisão vem do índice, não de uma leitura prévia. */
  public async updateProfile(input: UpdateCompanyUserProfileInput): Promise<void> {
    const changes = {
      ...(input.contactAddress === undefined ? {} : { contactAddress: input.contactAddress }),
      ...(input.contactChannel === undefined ? {} : { contactChannel: input.contactChannel }),
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.taxId === undefined ? {} : { taxId: input.taxId }),
      ...(input.username === undefined ? {} : { username: input.username }),
    }
    if (Object.keys(changes).length === 0) return

    try {
      await this.database
        .update(identityUserProfiles)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(identityUserProfiles.userId, input.userId))
    } catch (error) {
      const constraint = violatedUniqueConstraint(error)
      if (constraint === USERNAME_CONSTRAINT) throw new DuplicateUsernameError()
      if (constraint === TAX_ID_CONSTRAINT) throw new DuplicateTaxIdError()
      throw error
    }
  }

  private async fetchPendingInvitations(input: {
    readonly companyId: string
    readonly userIds: readonly string[]
  }): Promise<ReadonlyMap<string, Date>> {
    if (input.userIds.length === 0) return new Map()

    const rows = await this.database
      .select({ expiresAt: userInvitations.expiresAt, userId: userInvitations.userId })
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.companyId, input.companyId),
          eq(userInvitations.status, 'pending'),
          inArray(userInvitations.userId, input.userIds),
        ),
      )

    return new Map(rows.map((row) => [row.userId, row.expiresAt]))
  }

  private async fetchRoles(input: {
    readonly companyId: string
    readonly userIds: readonly string[]
  }): Promise<ReadonlyMap<string, readonly CompanyRole[]>> {
    if (input.userIds.length === 0) return new Map()

    const rows = await this.database
      .select({ role: membershipRoles.role, userId: userCompanyMemberships.userId })
      .from(membershipRoles)
      .innerJoin(
        userCompanyMemberships,
        eq(userCompanyMemberships.id, membershipRoles.membershipId),
      )
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          inArray(userCompanyMemberships.userId, input.userIds),
        ),
      )

    const rolesByUser = new Map<string, CompanyRole[]>()
    for (const row of rows) {
      const roles = rolesByUser.get(row.userId) ?? []
      roles.push(row.role)
      rolesByUser.set(row.userId, roles)
    }
    return rolesByUser
  }
}

function decodeCursor(
  value: string | null,
): { readonly createdAt: Date; readonly id: string } | null {
  if (value === null) return null
  const separator = value.lastIndexOf('::')
  if (separator < 0) return null
  const createdAt = new Date(value.slice(0, separator))
  const id = value.slice(separator + 2)
  return Number.isNaN(createdAt.getTime()) || id.length === 0 ? null : { createdAt, id }
}

function toRecord(
  row: MembershipRow,
  rolesByUser: ReadonlyMap<string, readonly CompanyRole[]>,
  pendingInvitationsByUser: ReadonlyMap<string, Date>,
): CompanyUserRecord {
  const expiresAt = pendingInvitationsByUser.get(row.userId)
  /** Sem perfil, o `leftJoin` traz nulo em cada coluna dele — vazio é a resposta honesta. */
  return {
    contactAddress: row.contactAddress ?? '',
    contactChannel: row.contactChannel ?? DEFAULT_CONTACT_CHANNEL,
    email: row.email ?? '',
    membershipId: row.membershipId,
    membershipStatus: row.membershipStatus,
    name: row.name ?? '',
    pendingInvitation: expiresAt === undefined ? undefined : { expiresAt },
    phone: row.phone ?? '',
    roles: rolesByUser.get(row.userId) ?? [],
    taxId: row.taxId ?? '',
    userId: row.userId,
    username: row.username ?? '',
  }
}

/**
 * O motorista e o agregado já existiam antes do convite: `fleet_drivers` guarda a ficha, com CPF
 * único por empresa, e a criação da ficha é que costuma disparar o convite (ver
 * `fleet-drivers.use-case.ts`). Convidar pela tela de usuários é a porta contrária, e sem isto ela
 * produziria uma segunda pessoa para o mesmo CPF — usuário com papel Motorista que a frota não
 * conhece.
 *
 * Só preenche ficha órfã (`membership_id is null`): ficha já vinculada pertence a outro usuário, e
 * roubá-la deixaria o primeiro sem frota calada. Não achar ficha não é erro — quem convida pode
 * estar cadastrando a pessoa antes da ficha; o chamador recebe `null` e avisa na tela.
 */
async function linkFleetDriver(
  transaction: Parameters<Parameters<Database['transaction']>[0]>[0],
  input: {
    readonly companyId: string
    readonly membershipId: string
    readonly roles: readonly CompanyRole[]
    readonly taxId: string
  },
): Promise<string | null> {
  if (input.taxId === '') return null
  if (!input.roles.some((role) => FLEET_LINKED_ROLES.includes(role))) return null

  const [linked] = await transaction
    .update(fleetDrivers)
    .set({ membershipId: input.membershipId, updatedAt: new Date() })
    .where(
      and(
        eq(fleetDrivers.companyId, input.companyId),
        eq(fleetDrivers.taxId, input.taxId),
        isNull(fleetDrivers.membershipId),
      ),
    )
    .returning({ id: fleetDrivers.id })

  return linked?.id ?? null
}
