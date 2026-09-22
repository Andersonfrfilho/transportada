/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ScheduledJob } from '../../shared/job-catalog.constant.js'

export type JobScheduleRow = Readonly<{
  enabled: boolean
  intervalSeconds: number
  job: ScheduledJob
  nextRunAt: string
  pausedAt: string | null
  pausedBy: string | null
}>

export type JobScheduleControlRepository = Readonly<{
  /** `null` quando a rotina não tem linha no relógio (não deveria acontecer — as quatro nascem seedadas). */
  listSchedules: () => Promise<readonly JobScheduleRow[]>
  pause: (input: {
    readonly actorUserId: string
    readonly job: ScheduledJob
  }) => Promise<JobScheduleRow | null>
  resume: (input: { readonly job: ScheduledJob }) => Promise<JobScheduleRow | null>
}>
