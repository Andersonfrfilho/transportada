/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { EmailDriverPort } from '@adatechnology/notification-contracts'
import { sql } from 'drizzle-orm'

import {
  type CompanyExpenseReminderPorts,
  DEFAULT_REMINDER_SETTINGS,
  type ReminderChannel,
  type ReminderPerson,
} from '../application/company-expense-reminder.port.js'
import {
  isBarredFromExpenseReminders,
  personalReminderChannels,
} from '../domain/expense-reminder.policy.js'

export type CompanyExpenseReminderDatabase = ReturnType<typeof createDrizzleProvider>['db']

const TEMPLATE_LOCALE = 'pt-BR'

type PersonRow = {
  readonly drives_in_fleet: boolean
  readonly email_address: string | null
  readonly has_verified_whatsapp: boolean
  readonly name: string | null
  readonly push_opt_in: boolean
  readonly roles: readonly string[]
  readonly user_id: string
  readonly whatsapp_opt_in: boolean
  readonly whatsapp_phone: string | null
}

function toPerson(row: PersonRow): ReminderPerson {
  const emailAddress =
    row.email_address === null || row.email_address === '' ? null : row.email_address
  return {
    channels: personalReminderChannels({
      hasEmail: emailAddress !== null,
      hasVerifiedWhatsapp: row.has_verified_whatsapp,
      pushOptIn: row.push_opt_in,
      whatsappOptIn: row.whatsapp_opt_in,
    }),
    emailAddress,
    name: row.name ?? '',
    userId: row.user_id,
    whatsappPhone: row.whatsapp_phone,
  }
}

/**
 * ⚠️ Espelha as leituras da API (`drizzle-expense-reminders.repository.ts` e `drizzle-expense-reminder-recipients.repository.ts`):
 * SQL por valor, sem schema copiado. Toda leitura de pessoa passa pelo vínculo ativo da empresa e pela conta ativa; o e-mail é o
 * do perfil, senão o contato do convite quando o canal foi e-mail. Motorista (papel `driver`/`aggregate`, direto ou por grupo, ou
 * ficha da frota que dirige) nunca volta daqui. A paridade é cobrada por
 * `test/company-expense-reminder/parity.contract.ts`.
 */
export function createDrizzleCompanyExpenseReminderPorts(input: {
  readonly appBaseUrl: string | null
  readonly database: CompanyExpenseReminderDatabase
  readonly emailDriver: EmailDriverPort | undefined
  /** Envio de texto pelo Evolution da empresa; ausente, o canal falha e a reserva é solta. */
  readonly sendWhatsAppText:
    | ((params: {
        readonly body: string
        readonly companyId: string
        readonly number: string
      }) => Promise<unknown>)
    | undefined
}): CompanyExpenseReminderPorts {
  const { database } = input

  async function selectPeople(
    companyId: string,
    filter: ReturnType<typeof sql>,
  ): Promise<readonly ReminderPerson[]> {
    const rows = (await database.execute(sql`
      select m.user_id::text as user_id, p.name,
             case when coalesce(trim(p.email), '') <> '' then trim(p.email)
                  when p.contact_channel = 'email' and coalesce(trim(p.contact_address), '') <> '' then trim(p.contact_address)
                  else null end as email_address,
             (w.user_id is not null) as has_verified_whatsapp,
             w.phone as whatsapp_phone,
             coalesce(pref.push_enabled, false) as push_opt_in,
             coalesce(pref.whatsapp_enabled, false) as whatsapp_opt_in,
             array(
               select r.role from membership_roles r where r.membership_id = m.id
               union
               select gr.role from membership_groups mg
                 join company_group_roles gr on gr.group_id = mg.group_id
                where mg.membership_id = m.id
             ) as roles,
             exists(
               select 1 from fleet_drivers fd
                where fd.company_id = m.company_id and fd.membership_id = m.id and (fd.can_drive or fd.can_act_as_helper)
             ) as drives_in_fleet
      from user_company_memberships m
      join identity_users u on u.id = m.user_id and u.status = 'active'
      left join identity_user_profiles p on p.user_id = m.user_id
      left join company_expense_reminder_preferences pref
        on pref.company_id = m.company_id and pref.user_id = m.user_id
      left join user_whatsapp_phones w on w.user_id = m.user_id and w.verified_at is not null
      where m.company_id = ${companyId}::uuid and m.status = 'active' and ${filter}
      order by m.user_id
    `)) as unknown as readonly PersonRow[]
    // Motorista nunca recebe aviso de conta (RF24): fora como responsável e como administrador.
    return rows
      .filter(
        (row) =>
          !isBarredFromExpenseReminders({ drivesInFleet: row.drives_in_fleet, roles: row.roles }),
      )
      .map(toPerson)
  }

  return {
    appBaseUrl: input.appBaseUrl,
    companies: {
      displayName: async ({ companyId }) => {
        const rows = (await database.execute(sql`
          select legal_name, trade_name, display_name_mode from company_fiscal_profiles
          where company_id = ${companyId}::uuid
        `)) as unknown as readonly {
          readonly display_name_mode: string
          readonly legal_name: string
          readonly trade_name: string
        }[]
        const row = rows[0]
        if (row === undefined) return ''
        const legal = row.legal_name.trim()
        const trade = row.trade_name.trim()
        if (row.display_name_mode === 'legal_name') return legal === '' ? trade : legal
        return trade === '' ? legal : trade
      },
      listWithOpenOccurrences: async () => {
        const rows = (await database.execute(sql`
          select distinct company_id::text as company_id from company_expense_occurrences
          where status = 'open' order by company_id
        `)) as unknown as readonly { readonly company_id: string }[]
        return rows.map((row) => row.company_id)
      },
    },
    whatsapp: {
      sendText: async (params) => {
        if (input.sendWhatsAppText === undefined) throw new Error('whatsapp_not_configured')
        await input.sendWhatsAppText(params)
      },
    },
    mailer: {
      send: async (email) => {
        if (input.emailDriver === undefined) throw new Error('email_delivery_not_configured')
        const result = await input.emailDriver.send({
          html: email.html,
          idempotencyKey: email.idempotencyKey,
          subject: email.subject,
          text: email.text,
          to: email.to,
        })
        if (result.outcome !== 'sent') throw new Error(`email_not_sent:${result.outcome}`)
      },
    },
    occurrences: {
      listOpen: async ({ companyId }) => {
        const rows = (await database.execute(sql`
          select o.id::text as id, o.company_id::text as company_id, o.competence, o.due_date::text as due_date,
                 o.expected_amount::text as expected_amount, e.name as expense_name, c.name as category_name,
                 d.name as payee_name, e.responsible_user_id::text as responsible_user_id
          from company_expense_occurrences o
          join company_expenses e on e.company_id = o.company_id and e.id = o.expense_id
          join company_expense_categories c on c.company_id = e.company_id and c.id = e.category_id
          left join fleet_drivers d on d.company_id = e.company_id and d.id = e.payee_driver_id
          where o.company_id = ${companyId}::uuid and o.status = 'open'
          order by o.due_date, o.id
        `)) as unknown as readonly {
          readonly category_name: string
          readonly company_id: string
          readonly competence: string
          readonly due_date: string
          readonly expected_amount: string
          readonly expense_name: string
          readonly id: string
          readonly payee_name: string | null
          readonly responsible_user_id: string | null
        }[]
        return rows.map((row) => ({
          categoryName: row.category_name,
          companyId: row.company_id,
          competence: row.competence,
          dueDate: row.due_date,
          expectedAmount: row.expected_amount,
          expenseName: row.expense_name,
          id: row.id,
          payeeName: row.payee_name,
          responsibleUserId: row.responsible_user_id,
        }))
      },
    },
    people: {
      findAdmins: ({ companyId }) =>
        selectPeople(
          companyId,
          sql`exists (select 1 from membership_roles r where r.membership_id = m.id and r.role = 'company-admin')`,
        ),
      findById: async ({ companyId, userId }) =>
        (await selectPeople(companyId, sql`m.user_id = ${userId}::uuid`))[0] ?? null,
    },
    sent: {
      record: async (key) => {
        const rows = await database.execute(sql`
          insert into company_expense_reminders_sent
            (company_id, occurrence_id, recipient_user_id, day, kind, channel)
          values (${key.companyId}::uuid, ${key.occurrenceId}::uuid, ${key.recipientUserId}::uuid,
                  ${key.day}::date, ${key.kind}, ${key.channel})
          on conflict (occurrence_id, recipient_user_id, day, kind) do nothing
          returning id
        `)
        return rows.length > 0
      },
      release: async (key) => {
        await database.execute(sql`
          delete from company_expense_reminders_sent
          where company_id = ${key.companyId}::uuid and occurrence_id = ${key.occurrenceId}::uuid
            and recipient_user_id = ${key.recipientUserId}::uuid and day = ${key.day}::date and kind = ${key.kind}
        `)
      },
    },
    settings: {
      get: async ({ companyId }) => {
        const rows = (await database.execute(sql`
          select days_before, max_overdue_notices, email_enabled, whatsapp_enabled, push_enabled,
                 daily_summary_enabled, daily_summary_hour
          from company_expense_reminder_settings where company_id = ${companyId}::uuid
        `)) as unknown as readonly {
          readonly daily_summary_enabled: boolean
          readonly daily_summary_hour: number
          readonly days_before: number
          readonly email_enabled: boolean
          readonly max_overdue_notices: number
          readonly push_enabled: boolean
          readonly whatsapp_enabled: boolean
        }[]
        const row = rows[0]
        if (row === undefined) return DEFAULT_REMINDER_SETTINGS
        const enabledChannels: ReminderChannel[] = [
          ...(row.email_enabled ? (['email'] as const) : []),
          ...(row.whatsapp_enabled ? (['whatsapp'] as const) : []),
          ...(row.push_enabled ? (['push'] as const) : []),
        ]
        return {
          dailySummaryEnabled: row.daily_summary_enabled,
          dailySummaryHour: row.daily_summary_hour,
          daysBefore: row.days_before,
          enabledChannels,
          maxOverdueNotices: row.max_overdue_notices,
        }
      },
    },
    templates: {
      findWhatsapp: async ({ companyId, key }) => {
        const rows = (await database.execute(sql`
          select body from notification.templates
          where company_id = ${companyId}::uuid and key = ${key} and channel = 'whatsapp'
            and locale = ${TEMPLATE_LOCALE} and active
          order by version desc limit 1
        `)) as unknown as readonly { readonly body: string }[]
        return rows[0] ?? null
      },
      findEmail: async ({ companyId, key }) => {
        const rows = (await database.execute(sql`
          select body, coalesce(subject, '') as subject from notification.templates
          where company_id = ${companyId}::uuid and key = ${key} and channel = 'email'
            and locale = ${TEMPLATE_LOCALE} and active
          order by version desc limit 1
        `)) as unknown as readonly { readonly body: string; readonly subject: string }[]
        return rows[0] ?? null
      },
    },
  }
}
