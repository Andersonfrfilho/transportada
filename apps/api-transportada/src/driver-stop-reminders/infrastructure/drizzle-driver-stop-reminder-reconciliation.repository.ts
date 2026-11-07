/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  CurrentStopReminderStage,
  DriverStopReminderReconciliationRepository,
} from '../application/driver-stop-reminder-reconciliation.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type StageRow = Readonly<{
  anchor_at: Date | string
  driver_id: string
  stage: CurrentStopReminderStage['stage']
  stop_id: string
  trip_id: string
}>

/** Toda leitura é filtrada pela empresa; a viagem na rua é a única que tem etapa atual. */
export class DrizzleDriverStopReminderReconciliationRepository
  implements DriverStopReminderReconciliationRepository
{
  public constructor(private readonly database: Database) {}

  public async listMissingCurrentStages(params: {
    readonly companyId: string
  }): Promise<readonly CurrentStopReminderStage[]> {
    const rows = (await this.database.execute(sql`
      select * from (
        select s."id" as stop_id, s."trip_id" as trip_id,
          case when s."en_route_since" is not null then 'arrival' else 'settlement' end as stage,
          case when s."en_route_since" is not null
            then coalesce(s."en_route_tapped_at", s."en_route_since")
            else s."arrived_at" end as anchor_at,
          (select d."driver_id" from trip_drivers d
            where d."company_id" = s."company_id" and d."trip_id" = s."trip_id"
            order by d."position" limit 1) as driver_id
        from trip_stops s
        join trips t on t."id" = s."trip_id" and t."company_id" = s."company_id"
        join company_driver_reminder_settings c
          on c."company_id" = s."company_id" and c."enabled" = true
        where s."company_id" = ${params.companyId}::uuid
          and t."status" = 'on_delivery_route'
          and s."completed_at" is null
          and (s."en_route_since" is not null or s."arrived_at" is not null)
      ) current_stage
      where driver_id is not null
        and not exists (
          select 1 from driver_stop_reminders r
          where r."company_id" = ${params.companyId}::uuid
            and r."trip_stop_id" = current_stage.stop_id
            and r."stage" = current_stage.stage
            and r."anchor_at" = current_stage.anchor_at
        )
      order by anchor_at
    `)) as unknown as readonly StageRow[]

    return rows.map((row) => ({
      anchorAt: new Date(row.anchor_at),
      driverId: row.driver_id,
      stage: row.stage,
      stopId: row.stop_id,
      tripId: row.trip_id,
    }))
  }
}
