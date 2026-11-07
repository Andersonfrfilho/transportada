/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  CurrentStopReminderStage,
  OpenCurrentStopReminderParams,
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

/**
 * A mesma saída de um ciclo pode ter sido gravada pelo evento (âncora corrigida pelo relógio do aparelho) e,
 * aqui, lida de `trip_stops` (hora do servidor): as âncoras divergem e a igualdade exata reabriria etapa já
 * tratada. A chave é o CICLO: a última saída (`arrival`) ou chegada (`settlement`) registrada em
 * `trip_stop_events`. Lembrete criado a partir desse evento, em qualquer status, fecha a pergunta; só um evento
 * mais novo (saída cancelada e refeita) abre outro. Parada sem evento (histórico) cai na âncora exata.
 * A folga cobre o relógio do JS gravando `recorded_at` um instante depois do `now()` da transação do lembrete.
 */
function missingCurrentStagesSql(companyId: string) {
  return sql`
    select * from (
      select s."company_id" as company_id, s."id" as stop_id, s."trip_id" as trip_id,
        case when s."en_route_since" is not null then 'arrival' else 'settlement' end as stage,
        case when s."en_route_since" is not null
          then coalesce(s."en_route_tapped_at", s."en_route_since")
          else s."arrived_at" end as anchor_at,
        (select max(e."recorded_at") from trip_stop_events e
          where e."company_id" = s."company_id" and e."stop_id" = s."id"
            and e."kind" = case when s."en_route_since" is not null then 'departed' else 'arrived' end
        ) as cycle_at,
        (select d."driver_id" from trip_drivers d
          where d."company_id" = s."company_id" and d."trip_id" = s."trip_id"
          order by d."position" limit 1) as driver_id
      from trip_stops s
      join trips t on t."id" = s."trip_id" and t."company_id" = s."company_id"
      join company_driver_reminder_settings c
        on c."company_id" = s."company_id" and c."enabled" = true
      where s."company_id" = ${companyId}::uuid
        and t."status" = 'on_delivery_route'
        and s."completed_at" is null
        and (s."en_route_since" is not null or s."arrived_at" is not null)
    ) current_stage
    where driver_id is not null
      and not exists (
        select 1 from driver_stop_reminders r
        where r."company_id" = current_stage.company_id
          and r."trip_stop_id" = current_stage.stop_id
          and r."stage" = current_stage.stage
          and case when current_stage.cycle_at is not null
            then r."created_at" >= current_stage.cycle_at - interval '1 minute'
            else r."anchor_at" = current_stage.anchor_at end
      )`
}

/** Toda leitura é filtrada pela empresa; a viagem na rua é a única que tem etapa atual. */
export class DrizzleDriverStopReminderReconciliationRepository
  implements DriverStopReminderReconciliationRepository
{
  public constructor(private readonly database: Database) {}

  public async listMissingCurrentStages(params: {
    readonly companyId: string
    readonly limit: number
  }): Promise<readonly CurrentStopReminderStage[]> {
    const rows = (await this.database.execute(sql`
      select * from (${missingCurrentStagesSql(params.companyId)}) missing
      order by anchor_at
      limit ${params.limit}
    `)) as unknown as readonly StageRow[]

    return rows.map((row) => ({
      anchorAt: new Date(row.anchor_at),
      driverId: row.driver_id,
      stage: row.stage,
      stopId: row.stop_id,
      tripId: row.trip_id,
    }))
  }

  public async openIfStillCurrent(
    params: OpenCurrentStopReminderParams,
  ): Promise<{ readonly id: string } | undefined> {
    const rows = (await this.database.execute(sql`
      insert into driver_stop_reminders
        ("company_id", "trip_id", "trip_stop_id", "driver_id", "stage", "status", "anchor_at",
         "origin_kind", "expected_at", "due_at")
      select company_id, trip_id, stop_id, driver_id, stage, 'pending', anchor_at,
        'fallback', ${params.expectedAt.toISOString()}::timestamptz, ${params.dueAt.toISOString()}::timestamptz
      from (${missingCurrentStagesSql(params.companyId)}) missing
      where stop_id = ${params.stopId}::uuid and stage = ${params.stage}
      on conflict do nothing
      returning "id"
    `)) as unknown as readonly { id: string }[]
    return rows[0]
  }
}
