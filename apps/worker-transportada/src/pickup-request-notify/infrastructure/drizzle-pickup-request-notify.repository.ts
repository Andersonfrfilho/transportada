/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Espelha, por valor e sem schema copiado, a tabela `pickup_requests` e a caixa de saída `pickup_request_notifications`
 * da API (`database/pickup-request.schema.ts`). O estado do pedido só muda por `update … where status = :de`, como na API:
 * a expiração e a marca de parado são a única escrita do worker no pedido.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { PICKUP_NOTIFY_LEASE_MINUTES } from '../domain/pickup-request-notify.constant.js'
import type {
  PendingPickupNotification,
  PickupRequestNotifyPorts,
} from '../application/pickup-request-notify.port.js'

export type PickupRequestNotifyDatabase = ReturnType<typeof createDrizzleProvider>['db']

type ClaimRow = {
  readonly attempts: number
  readonly audience: PendingPickupNotification['audience']
  readonly cargo_description: string
  readonly channel: PendingPickupNotification['channel']
  readonly company_id: string
  readonly decision_note: string | null
  readonly destination_city: string | null
  readonly event: PendingPickupNotification['event']
  readonly id: string
  readonly kind: 'delivery' | 'pickup'
  readonly origin_city: string | null
  readonly request_id: string
  readonly requester_email: string | null
  readonly requester_name: string
  readonly requester_phone: string | null
  readonly window_end: string
  readonly window_start: string
}

export function createDrizzlePickupRequestNotifyPorts(input: {
  readonly database: PickupRequestNotifyDatabase
  readonly delivery: PickupRequestNotifyPorts['delivery']
  readonly links: PickupRequestNotifyPorts['links']
}): PickupRequestNotifyPorts {
  const { database } = input
  return {
    delivery: input.delivery,
    links: input.links,
    outbox: {
      claim: async ({ limit, now }) => {
        // Reserva por `available_at` à frente: se o ciclo morrer no meio, o aviso volta sozinho depois do prazo.
        const rows = (await database.execute(sql`
          with picked as (
            select id from pickup_request_notifications
            where status = 'pending' and available_at <= ${now.toISOString()}::timestamptz
            order by available_at
            limit ${limit}
            for update skip locked
          ), leased as (
            update pickup_request_notifications n
               set attempts = n.attempts + 1,
                   available_at = ${now.toISOString()}::timestamptz + make_interval(mins => ${PICKUP_NOTIFY_LEASE_MINUTES})
              from picked
             where n.id = picked.id
            returning n.id, n.company_id, n.pickup_request_id, n.event, n.audience, n.channel, n.attempts
          )
          select l.id::text as id, l.company_id::text as company_id, l.pickup_request_id::text as request_id,
                 l.event, l.audience, l.channel, l.attempts,
                 r.kind, r.requester_name, r.requester_email, r.requester_phone, r.cargo_description,
                 r.decision_note, r.origin ->> 'city' as origin_city, r.destination ->> 'city' as destination_city,
                 r.window_start::text as window_start, r.window_end::text as window_end
            from leased l
            join pickup_requests r on r.id = l.pickup_request_id and r.company_id = l.company_id
           order by l.id
        `)) as unknown as readonly ClaimRow[]
        return rows.map(toPending)
      },
      markFailed: async ({ error, id }) => {
        await database.execute(sql`
          update pickup_request_notifications set status = 'failed', last_error = ${error}
           where id = ${id}::uuid and status = 'pending'
        `)
      },
      markRetry: async ({ availableAt, error, id }) => {
        await database.execute(sql`
          update pickup_request_notifications
             set available_at = ${availableAt.toISOString()}::timestamptz, last_error = ${error}
           where id = ${id}::uuid and status = 'pending'
        `)
      },
      markSent: async ({ id, now }) => {
        await database.execute(sql`
          update pickup_request_notifications set status = 'sent', sent_at = ${now.toISOString()}::timestamptz, last_error = null
           where id = ${id}::uuid and status = 'pending'
        `)
      },
      markSkipped: async ({ id, reason }) => {
        await database.execute(sql`
          update pickup_request_notifications set status = 'skipped', last_error = ${reason}
           where id = ${id}::uuid and status = 'pending'
        `)
      },
    },
    sweep: {
      expireDue: async ({ now }) => {
        const rows = (await database.execute(sql`
          with expired as (
            update pickup_requests set status = 'expired', updated_at = ${now.toISOString()}::timestamptz
             where status = 'requested' and expires_at <= ${now.toISOString()}::timestamptz
            returning id, company_id, requester_email, requester_phone
          ), notified as (
            insert into pickup_request_notifications (company_id, pickup_request_id, event, audience, channel)
            select company_id, id, 'expired', 'client', 'email' from expired where requester_email is not null
            union all
            select company_id, id, 'expired', 'client', 'whatsapp' from expired where requester_phone is not null
            on conflict do nothing
            returning 1
          )
          select (select count(*) from expired)::int as total
        `)) as unknown as readonly { readonly total: number }[]
        return Number(rows[0]?.total ?? 0)
      },
      markStale: async ({ now, olderThanHours }) => {
        const rows = (await database.execute(sql`
          with stale as (
            update pickup_requests set stale_alerted_at = ${now.toISOString()}::timestamptz
             where status = 'requested' and stale_alerted_at is null
               and created_at < ${now.toISOString()}::timestamptz - make_interval(hours => ${olderThanHours})
            returning id, company_id
          ), notified as (
            insert into pickup_request_notifications (company_id, pickup_request_id, event, audience, channel)
            select company_id, id, 'stale', 'office', 'email' from stale
            on conflict do nothing
            returning 1
          )
          select (select count(*) from stale)::int as total
        `)) as unknown as readonly { readonly total: number }[]
        return Number(rows[0]?.total ?? 0)
      },
    },
  }
}

function toPending(row: ClaimRow): PendingPickupNotification {
  return {
    attempts: Number(row.attempts),
    audience: row.audience,
    channel: row.channel,
    companyId: row.company_id,
    event: row.event,
    id: row.id,
    request: {
      cargoDescription: row.cargo_description,
      decisionNote: row.decision_note,
      destinationCity: row.destination_city ?? '',
      id: row.request_id,
      kind: row.kind,
      originCity: row.origin_city ?? '',
      requesterEmail: row.requester_email,
      requesterName: row.requester_name,
      requesterPhone: row.requester_phone,
      windowEnd: row.window_end,
      windowStart: row.window_start,
    },
  }
}

/** Quem no escritório recebe: administrador e operador ativos com e-mail (perfil, ou contato do convite por e-mail). */
export async function findPickupOfficeEmails(
  database: PickupRequestNotifyDatabase,
  input: { readonly companyId: string },
): Promise<readonly string[]> {
  const rows = (await database.execute(sql`
    select distinct case when coalesce(trim(p.email), '') <> '' then lower(trim(p.email))
                         when p.contact_channel = 'email' and coalesce(trim(p.contact_address), '') <> '' then lower(trim(p.contact_address))
                         else null end as email_address
      from user_company_memberships m
      join identity_users u on u.id = m.user_id and u.status = 'active'
      left join identity_user_profiles p on p.user_id = m.user_id
     where m.company_id = ${input.companyId}::uuid and m.status = 'active'
       and (
         exists (select 1 from membership_roles r where r.membership_id = m.id and r.role in ('company-admin', 'operator'))
         or exists (
           select 1 from membership_groups mg
             join company_group_roles gr on gr.group_id = mg.group_id
            where mg.membership_id = m.id and gr.role in ('company-admin', 'operator')
         )
       )
  `)) as unknown as readonly { readonly email_address: string | null }[]
  return rows.flatMap((row) => (row.email_address === null ? [] : [row.email_address]))
}
