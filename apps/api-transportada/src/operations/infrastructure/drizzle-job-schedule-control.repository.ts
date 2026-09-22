/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { jobSchedules } from '../../database/database.schema.js'
import type {
  JobScheduleControlRepository,
  JobScheduleRow,
} from '../application/job-schedule-control.port.js'

export type JobScheduleControlDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleJobScheduleControlRepository(
  database: JobScheduleControlDatabase,
): JobScheduleControlRepository {
  return {
    async listSchedules() {
      const rows = await database.select().from(jobSchedules).orderBy(jobSchedules.job)
      return rows.map(toJobScheduleRow)
    },

    async pause(input) {
      const updated = await database
        .update(jobSchedules)
        .set({
          enabled: false,
          pausedAt: sql`now()`,
          pausedBy: input.actorUserId,
          updatedAt: sql`now()`,
        })
        .where(eq(jobSchedules.job, input.job))
        .returning()

      const row = updated[0]
      return row === undefined ? null : toJobScheduleRow(row)
    },

    async resume(input) {
      const updated = await database
        .update(jobSchedules)
        .set({ enabled: true, pausedAt: null, pausedBy: null, updatedAt: sql`now()` })
        .where(eq(jobSchedules.job, input.job))
        .returning()

      const row = updated[0]
      return row === undefined ? null : toJobScheduleRow(row)
    },
  }
}

function toJobScheduleRow(row: typeof jobSchedules.$inferSelect): JobScheduleRow {
  return {
    enabled: row.enabled,
    intervalSeconds: row.intervalSeconds,
    job: row.job,
    nextRunAt: row.nextRunAt.toISOString(),
    pausedAt: row.pausedAt === null ? null : row.pausedAt.toISOString(),
    pausedBy: row.pausedBy,
  }
}
