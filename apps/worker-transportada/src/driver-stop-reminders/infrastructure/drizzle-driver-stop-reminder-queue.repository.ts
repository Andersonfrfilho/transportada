/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  DriverStopReminderQueuePort,
  ListDueDriverStopRemindersParams,
} from '../application/driver-stop-reminder-queue.port.js'

export type DriverStopReminderDatabase = ReturnType<typeof createDrizzleProvider>['db']

type DueRow = Readonly<{ company_id: string; reminder_id: string }>

/**
 * A reserva (`dispatching_until`, `version`) é da API: ela grava a mesma coluna, e uma reserva do worker
 * faria a própria entrega responder "already_reserved". Aqui só se **descobre** — empresa sem linha de
 * configuração ou com o interruptor desligado nunca entra.
 */
export function createDrizzleDriverStopReminderQueue(
  database: DriverStopReminderDatabase,
): DriverStopReminderQueuePort {
  return {
    async listDue(params: ListDueDriverStopRemindersParams) {
      const exclusion =
        params.excludeReminderIds.length === 0
          ? sql``
          : sql`and r."id" not in (${sql.join(
              params.excludeReminderIds.map((reminderId) => sql`${reminderId}::uuid`),
              sql`, `,
            )})`

      const rows = (await database.execute(sql`
        select r."id" as reminder_id, r."company_id" as company_id
        from driver_stop_reminders r
        join company_driver_reminder_settings s
          on s."company_id" = r."company_id" and s."enabled" = true
        where r."status" = 'pending'
          and r."due_at" <= ${params.now.toISOString()}::timestamptz
          and (r."dispatching_until" is null
            or r."dispatching_until" <= ${params.now.toISOString()}::timestamptz)
          ${exclusion}
        order by r."due_at"
        limit ${params.limit}
      `)) as unknown as readonly DueRow[]

      return rows.map((row) => ({ companyId: row.company_id, reminderId: row.reminder_id }))
    },
  }
}
