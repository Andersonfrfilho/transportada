/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql, type SQL } from 'drizzle-orm'

import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import { toWhatsAppPhoneKey } from '../../whatsapp-commands/domain/whatsapp-phone-key.policy.js'
import type {
  TripDispatchApprovalPorts,
  TripDispatchRequestRecord,
} from '../application/whatsapp-trip-dispatch-approval.service.js'
import type { PendingDriverStopEvent } from '../domain/trip-dispatch-approval.policy.js'

type TripDispatchRequestRepository = TripDispatchApprovalPorts['repository']

type Database = { execute(query: SQL): PromiseLike<unknown> }

type Row = {
  readonly company_id: string
  readonly driver_id: string
  readonly group_jid: string
  readonly id: string
  readonly pending_events: readonly PendingDriverStopEvent[]
  readonly responder_phone: string
  readonly responder_user_id: string
  readonly trip_id: string
}

const OPEN_UNIQUE = 'trip_dispatch_requests_company_trip_open_unique'

const RETURNING = sql`id, company_id, trip_id, driver_id, group_jid, responder_user_id, responder_phone, pending_events`

function toRecord(row: Row): TripDispatchRequestRecord {
  return {
    companyId: row.company_id,
    driverId: row.driver_id,
    groupJid: row.group_jid,
    id: row.id,
    pendingEvents: row.pending_events,
    responderPhone: row.responder_phone,
    responderUserId: row.responder_user_id,
    tripId: row.trip_id,
  }
}

/** Os pedidos de despacho do bot ao escritório (`trip_dispatch_requests`). */
export class DrizzleTripDispatchRequestRepository implements TripDispatchRequestRepository {
  public constructor(private readonly database: Database) {}

  public async appendEvent(input: {
    readonly companyId: string
    readonly event: PendingDriverStopEvent
    readonly id: string
  }): Promise<void> {
    await this.database.execute(
      sql`update trip_dispatch_requests
          set pending_events = pending_events || ${JSON.stringify([input.event])}::jsonb
          where company_id = ${input.companyId} and id = ${input.id} and status = 'open'`,
    )
  }

  public async claimExpired(now: Date): Promise<readonly TripDispatchRequestRecord[]> {
    const rows = (await this.database.execute(
      sql`update trip_dispatch_requests
          set status = 'expired', resolved_at = ${now.toISOString()}::timestamptz
          where status = 'open' and expires_at <= ${now.toISOString()}::timestamptz
          returning ${RETURNING}`,
    )) as readonly Row[]
    return rows.map((row) => toRecord(row))
  }

  public async claimReminders(input: {
    readonly afterMs: number
    readonly now: Date
  }): Promise<readonly TripDispatchRequestRecord[]> {
    const now = input.now.toISOString()
    const rows = (await this.database.execute(
      sql`update trip_dispatch_requests
          set reminded_at = ${now}::timestamptz
          where status = 'open' and reminded_at is null
            and expires_at > ${now}::timestamptz
            and created_at + make_interval(secs => ${input.afterMs / 1000}) <= ${now}::timestamptz
          returning ${RETURNING}`,
    )) as readonly Row[]
    return rows.map((row) => toRecord(row))
  }

  public async findOpenByResponder(input: {
    readonly companyId: string
    readonly phone: string
  }): Promise<null | TripDispatchRequestRecord> {
    const rows = (await this.database.execute(
      sql`select ${RETURNING} from trip_dispatch_requests
          where company_id = ${input.companyId} and status = 'open' and expires_at > now()
            and left(responder_phone, 4) || right(responder_phone, 8) = ${toWhatsAppPhoneKey(input.phone)}
          order by created_at desc limit 1`,
    )) as readonly Row[]
    const [row] = rows
    return row === undefined ? null : toRecord(row)
  }

  public async findOpenByTrip(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<null | TripDispatchRequestRecord> {
    const rows = (await this.database.execute(
      sql`select ${RETURNING} from trip_dispatch_requests
          where company_id = ${input.companyId} and trip_id = ${input.tripId}
            and status = 'open' and expires_at > now()
          limit 1`,
    )) as readonly Row[]
    const [row] = rows
    return row === undefined ? null : toRecord(row)
  }

  public async insert(input: {
    readonly companyId: string
    readonly driverId: string
    readonly event: PendingDriverStopEvent
    readonly expiresAt: Date
    readonly groupJid: string
    readonly responderPhone: string
    readonly responderUserId: string
    readonly tripId: string
  }): Promise<boolean> {
    try {
      // Um pedido vencido que o vigia ainda não fechou não pode segurar o índice do próximo.
      await this.database.execute(
        sql`update trip_dispatch_requests
            set status = 'expired', resolved_at = now()
            where company_id = ${input.companyId} and trip_id = ${input.tripId}
              and status = 'open' and expires_at <= now()`,
      )
      await this.database.execute(
        sql`insert into trip_dispatch_requests
              (company_id, trip_id, driver_id, group_jid, responder_user_id, responder_phone, pending_events, expires_at)
            values (${input.companyId}, ${input.tripId}, ${input.driverId}, ${input.groupJid},
              ${input.responderUserId}, ${input.responderPhone}, ${JSON.stringify([input.event])}::jsonb,
              ${input.expiresAt.toISOString()}::timestamptz)`,
      )
      return true
    } catch (error) {
      if (violatedUniqueConstraint(error) === OPEN_UNIQUE) return false
      throw error
    }
  }

  /** `open` → desfecho; só a aprovação que o despacho derrubou ainda vira `failed`. */
  public async resolve(input: {
    readonly companyId: string
    readonly id: string
    readonly note?: string
    readonly now: Date
    readonly status: 'approved' | 'declined' | 'expired' | 'failed'
  }): Promise<boolean> {
    const rows = (await this.database.execute(
      sql`update trip_dispatch_requests
          set status = ${input.status}, resolved_at = ${input.now.toISOString()}::timestamptz,
              resolution_note = ${input.note ?? null}
          where company_id = ${input.companyId} and id = ${input.id}
            and (status = 'open' or (status = 'approved' and ${input.status} = 'failed'))
          returning id`,
    )) as readonly unknown[]
    return rows.length > 0
  }
}

/** Quem planejou a viagem e tem telefone verificado (o mais recente a levá-la a `route_planned`). */
export async function findTripPlannerWithPhone(
  database: Database,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<null | { readonly phone: string; readonly userId: string }> {
  const rows = (await database.execute(
    sql`select e.actor_user_id as user_id, p.phone
        from trip_status_events e
        join user_whatsapp_phones p on p.user_id = e.actor_user_id and p.verified_at is not null
        where e.company_id = ${input.companyId} and e.trip_id = ${input.tripId}
        order by (e.to_status = 'route_planned') desc, e.occurred_at desc
        limit 1`,
  )) as readonly { readonly phone: string; readonly user_id: string }[]
  const [row] = rows
  return row === undefined ? null : { phone: row.phone, userId: row.user_id }
}

/** O primeiro nome do motorista, para a pergunta ao escritório; o cadastro sem nome vira "O motorista". */
export async function findDriverFirstName(
  database: Database,
  input: { readonly companyId: string; readonly driverId: string },
): Promise<string> {
  const rows = (await database.execute(
    sql`select name from fleet_drivers where company_id = ${input.companyId} and id = ${input.driverId}`,
  )) as readonly { readonly name: string }[]
  const first = rows[0]?.name.trim().split(/\s+/u)[0]
  return first === undefined || first === '' ? 'O motorista' : first
}
