/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.3 (RF24, RF26): quem pode receber o aviso de conta a vencer e por quais canais **dela**, e a configuração
 * dos lembretes da empresa. Toda consulta passa pelo vínculo ativo da empresa (`user_company_memberships`): o mesmo
 * usuário pedido pelo contexto de outra empresa é "não existe", nunca o contato da pessoa. A empresa (canais ligados)
 * é aplicada depois, por `chooseReminderRecipients`. Motorista (papel de quem dirige, direto ou por grupo, ou ficha da frota
 * que dirige) nunca volta daqui: o responsável motorista é "não existe" e o aviso cai nos administradores.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, exists, isNotNull, sql, type SQL } from 'drizzle-orm'

import {
  companyExpenseReminderPreferences,
  companyExpenseReminderSettings,
} from '../../database/company-expense.schema.js'
import { companyGroupRoles, membershipGroups } from '../../database/company-group.schema.js'
import { fleetDrivers } from '../../database/fleet.schema.js'
import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import {
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
} from '../../database/identity.schema.js'
import { userWhatsAppPhones } from '../../database/user-whatsapp-phone.schema.js'
import {
  DEFAULT_REMINDER_SETTINGS,
  type ReminderChannel,
  type ReminderPorts,
  type ReminderRecipient,
  type ReminderSettings,
} from '../application/expense-reminder.port.js'
import {
  isBarredFromExpenseReminders,
  personalReminderChannels,
} from '../domain/expense-reminder.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const ADMIN_ROLE = 'company-admin'

/** Papéis do vínculo, diretos e por grupo: é por eles que se sabe se a pessoa dirige. */
const MEMBERSHIP_ROLES = sql<string[]>`array(
  select ${membershipRoles.role} from ${membershipRoles}
   where ${membershipRoles.membershipId} = ${userCompanyMemberships.id}
  union
  select ${companyGroupRoles.role} from ${membershipGroups}
    join ${companyGroupRoles} on ${companyGroupRoles.groupId} = ${membershipGroups.groupId}
   where ${membershipGroups.membershipId} = ${userCompanyMemberships.id}
)`

/** Ficha da frota que dirige ou ajuda, ligada a este vínculo (qualquer situação da ficha). */
const DRIVES_IN_FLEET = sql<boolean>`exists(
  select 1 from ${fleetDrivers}
   where ${fleetDrivers.companyId} = ${userCompanyMemberships.companyId}
     and ${fleetDrivers.membershipId} = ${userCompanyMemberships.id}
     and (${fleetDrivers.canDrive} or ${fleetDrivers.canActAsHelper})
)`

/** E-mail do perfil, senão o contato quando o canal do convite foi e-mail. */
const HAS_EMAIL = sql<boolean>`(
  coalesce(trim(${identityUserProfiles.email}), '') <> ''
  or (${identityUserProfiles.contactChannel} = 'email' and coalesce(trim(${identityUserProfiles.contactAddress}), '') <> '')
)`

async function selectRecipients(
  db: Database,
  companyId: string,
  extra: SQL,
): Promise<readonly ReminderRecipient[]> {
  const rows = await db
    .select({
      drivesInFleet: DRIVES_IN_FLEET,
      hasEmail: sql<boolean>`coalesce(${HAS_EMAIL}, false)`,
      hasVerifiedWhatsapp: sql<boolean>`${userWhatsAppPhones.id} is not null`,
      pushOptIn: sql<boolean>`coalesce(${companyExpenseReminderPreferences.pushEnabled}, false)`,
      roles: MEMBERSHIP_ROLES,
      userId: userCompanyMemberships.userId,
      whatsappOptIn: sql<boolean>`coalesce(${companyExpenseReminderPreferences.whatsappEnabled}, false)`,
    })
    .from(userCompanyMemberships)
    .innerJoin(
      identityUsers,
      and(eq(identityUsers.id, userCompanyMemberships.userId), eq(identityUsers.status, 'active')),
    )
    .leftJoin(identityUserProfiles, eq(identityUserProfiles.userId, userCompanyMemberships.userId))
    .leftJoin(
      companyExpenseReminderPreferences,
      and(
        eq(companyExpenseReminderPreferences.companyId, userCompanyMemberships.companyId),
        eq(companyExpenseReminderPreferences.userId, userCompanyMemberships.userId),
      ),
    )
    .leftJoin(
      userWhatsAppPhones,
      and(
        eq(userWhatsAppPhones.userId, userCompanyMemberships.userId),
        isNotNull(userWhatsAppPhones.verifiedAt),
      ),
    )
    .where(
      and(
        eq(userCompanyMemberships.companyId, companyId),
        eq(userCompanyMemberships.status, 'active'),
        extra,
      ),
    )
    .orderBy(asc(userCompanyMemberships.userId))

  // Motorista nunca recebe aviso de conta (RF24): fora como responsável e como administrador.
  return rows
    .filter(
      (row) =>
        !isBarredFromExpenseReminders({ drivesInFleet: row.drivesInFleet, roles: row.roles }),
    )
    .map((row) => ({
      channels: personalReminderChannels({
        hasEmail: row.hasEmail,
        hasVerifiedWhatsapp: row.hasVerifiedWhatsapp,
        pushOptIn: row.pushOptIn,
        whatsappOptIn: row.whatsappOptIn,
      }),
      userId: row.userId,
    }))
}

export function createDrizzleExpenseReminderRecipients(db: Database): ReminderPorts['recipients'] {
  return {
    findAdmins: ({ companyId }) =>
      selectRecipients(
        db,
        companyId,
        exists(
          db
            .select({ one: sql`1` })
            .from(membershipRoles)
            .where(
              and(
                eq(membershipRoles.membershipId, userCompanyMemberships.id),
                eq(membershipRoles.role, ADMIN_ROLE),
              ),
            ),
        ),
      ),
    async findById({ companyId, userId }) {
      const [recipient] = await selectRecipients(
        db,
        companyId,
        eq(userCompanyMemberships.userId, userId),
      )
      return recipient ?? null
    },
  }
}

/** RF25 a RF27: sem linha, o padrão (`DEFAULT_REMINDER_SETTINGS`). E-mail é canal como os outros na empresa. */
export function createDrizzleExpenseReminderSettings(db: Database): ReminderPorts['settings'] {
  return {
    async get({ companyId }): Promise<ReminderSettings> {
      const [row] = await db
        .select()
        .from(companyExpenseReminderSettings)
        .where(eq(companyExpenseReminderSettings.companyId, companyId))
        .limit(1)
      if (row === undefined) return DEFAULT_REMINDER_SETTINGS
      const enabledChannels: ReminderChannel[] = [
        ...(row.emailEnabled ? (['email'] as const) : []),
        ...(row.whatsappEnabled ? (['whatsapp'] as const) : []),
        ...(row.pushEnabled ? (['push'] as const) : []),
      ]
      return {
        dailySummaryEnabled: row.dailySummaryEnabled,
        dailySummaryHour: row.dailySummaryHour,
        daysBefore: row.daysBefore,
        enabledChannels,
        maxOverdueNotices: row.maxOverdueNotices,
      }
    },
  }
}
