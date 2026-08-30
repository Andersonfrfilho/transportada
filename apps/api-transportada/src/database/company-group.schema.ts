/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { COMPANY_ROLES, companies, userCompanyMemberships } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * O grupo é o papel que a **empresa** cria: um conjunto nomeado de papéis e permissões que ela
 * atribui a várias pessoas. Ele não substitui os papéis do catálogo — soma-se a eles e à permissão
 * avulsa da pessoa, e o efetivo de alguém é a união das três origens.
 *
 * O nome é "grupo" porque é o que o Keycloak chama de grupo, e os dois lados ficam sincronizados:
 * chamar de perfil aqui e de grupo lá obrigaria toda conversa a traduzir.
 *
 * `keycloak_group_id` é **anulável** de propósito: o grupo nasce aqui e a sincronização pode falhar
 * ou atrasar. Nulo significa "ainda não existe do outro lado" — estado que a tela mostra e que a
 * sincronização conserta, em vez de um grupo que não pôde ser criado porque o provedor caiu.
 */
export const companyGroups = pgTable(
  'company_groups',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    name: text().notNull(),
    description: text().notNull().default(''),
    keycloakGroupId: text('keycloak_group_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_groups_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('company_groups_company_id_name_unique').on(table.companyId, table.name),
    check('company_groups_name_not_blank_check', sql`length(btrim(${table.name})) > 0`),
  ],
)

/** Os papéis do catálogo que o grupo carrega. Mesmo CHECK de `membership_roles`: um vocabulário só. */
export const companyGroupRoles = pgTable(
  'company_group_roles',
  {
    groupId: uuid('group_id').notNull(),
    role: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [companyGroups.id],
      name: 'company_group_roles_group_id_company_groups_id_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    check(
      'company_group_roles_role_check',
      sql`${table.role} in (${sql.raw(inList(COMPANY_ROLES))})`,
    ),
    primaryKey({ columns: [table.groupId, table.role], name: 'company_group_roles_pk' }),
  ],
)

/**
 * As permissões avulsas do grupo, fora dos papéis.
 *
 * ⚠️ **Sem CHECK sobre o catálogo, de propósito.** São quase quarenta permissões e a lista cresce a
 * cada feature: um CHECK cobraria uma migration por permissão nova sem impedir o único erro que
 * importa — conceder a quem não deveria ter. Quem valida o nome é o Zod da fronteira, contra a mesma
 * constante que o `authorize` consulta. É a decisão que o catálogo de rotinas já tomou, pelo mesmo
 * motivo.
 */
export const companyGroupPermissions = pgTable(
  'company_group_permissions',
  {
    groupId: uuid('group_id').notNull(),
    permission: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [companyGroups.id],
      name: 'company_group_permissions_group_id_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    check('company_group_permissions_not_blank_check', sql`length(btrim(${table.permission})) > 0`),
    primaryKey({
      columns: [table.groupId, table.permission],
      name: 'company_group_permissions_pk',
    }),
  ],
)

/** O vínculo entre a pessoa e os grupos dela. É conjunto, como os papéis: somam, não se excluem. */
export const membershipGroups = pgTable(
  'membership_groups',
  {
    membershipId: uuid('membership_id').notNull(),
    groupId: uuid('group_id').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.membershipId],
      foreignColumns: [userCompanyMemberships.id],
      name: 'membership_groups_membership_id_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [companyGroups.id],
      name: 'membership_groups_group_id_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    index('membership_groups_group_id_idx').on(table.groupId),
    primaryKey({ columns: [table.membershipId, table.groupId], name: 'membership_groups_pk' }),
  ],
)

/**
 * A permissão concedida **direto** à pessoa, fora de papel e de grupo. Ela existe para a exceção — e
 * é por ser exceção que carrega quem concedeu: sem isso, uma permissão avulsa aparecida na auditoria
 * não tem autor, e ninguém consegue perguntar o porquê a alguém.
 */
export const membershipPermissions = pgTable(
  'membership_permissions',
  {
    membershipId: uuid('membership_id').notNull(),
    permission: text().notNull(),
    grantedByUserId: uuid('granted_by_user_id').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.membershipId],
      foreignColumns: [userCompanyMemberships.id],
      name: 'membership_permissions_membership_id_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    check('membership_permissions_not_blank_check', sql`length(btrim(${table.permission})) > 0`),
    primaryKey({
      columns: [table.membershipId, table.permission],
      name: 'membership_permissions_pk',
    }),
  ],
)
