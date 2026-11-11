/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { TRIP_ON_ROAD_STATUSES } from '../../trips/domain/trip-state.policy.js'

import type {
  DriverStopReminderIdleReconciliationRepository,
  IdleStopReminderCandidate,
} from '../application/driver-stop-reminder-idle-reconciliation.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Emenda 2026-11-10 (D10/RF21): a viagem despachada em que o motorista nunca tocou "Iniciar rota" (`dispatched`, ou
 * `in_transit` com a carga conferida) também é cobrada, não só a `on_delivery_route`.
 */
const IDLE_TRIP_STATUSES = sql.join(
  TRIP_ON_ROAD_STATUSES.map((status) => sql`${status}`),
  sql`, `,
)

type IdleRow = Readonly<{
  anchor_at: Date | string
  driver_id: string
  stop_id: string
  trip_id: string
}>

/** Toda leitura é filtrada pela empresa. O ciclo começa na última baixa ou, sem baixa, no despacho da viagem. */
export class DrizzleDriverStopReminderIdleReconciliationRepository
  implements DriverStopReminderIdleReconciliationRepository
{
  public constructor(private readonly database: Database) {}

  public async listMissingIdleStages(params: {
    readonly companyId: string
  }): Promise<readonly IdleStopReminderCandidate[]> {
    const rows = (await this.database.execute(sql`
      select * from (
        select distinct on (t."id")
          next_stop."id" as stop_id, t."id" as trip_id,
          coalesce(
            (select max(done."completed_at") from trip_stops done
              where done."company_id" = t."company_id" and done."trip_id" = t."id"
                and done."completed_at" is not null),
            (select snapshot."dispatched_at" from trip_dispatch_snapshots snapshot
              where snapshot."company_id" = t."company_id" and snapshot."trip_id" = t."id"),
            t."created_at"
          ) as anchor_at,
          (select d."driver_id" from trip_drivers d
            where d."company_id" = t."company_id" and d."trip_id" = t."id"
            order by d."position" limit 1) as driver_id
        from trips t
        join company_driver_reminder_settings c
          on c."company_id" = t."company_id" and c."enabled" = true
        join trip_stops next_stop
          on next_stop."company_id" = t."company_id" and next_stop."trip_id" = t."id"
            and next_stop."completed_at" is null
        where t."company_id" = ${params.companyId}::uuid
          and t."status" in (${IDLE_TRIP_STATUSES})
          and not exists (
            select 1 from trip_stops moving
            where moving."company_id" = t."company_id" and moving."trip_id" = t."id"
              and moving."completed_at" is null
              and (moving."en_route_since" is not null or moving."arrived_at" is not null)
          )
        order by t."id", next_stop."sequence"
      ) idle_stage
      where driver_id is not null
        and not exists (
          select 1 from driver_stop_reminders r
          where r."company_id" = ${params.companyId}::uuid
            and r."trip_stop_id" = idle_stage.stop_id
            and r."stage" = 'idle'
            -- O Postgres guarda microssegundos e o lembrete grava a âncora em milissegundos (Date): sem truncar, a âncora
            -- nunca "alcança" a da viagem e um lembrete novo nasce assim que o anterior escala.
            and r."anchor_at" >= date_trunc('milliseconds', idle_stage.anchor_at)
        )
      order by anchor_at
    `)) as unknown as readonly IdleRow[]

    return rows.map((row) => ({
      anchorAt: new Date(row.anchor_at),
      driverId: row.driver_id,
      stopId: row.stop_id,
      tripId: row.trip_id,
    }))
  }
}
