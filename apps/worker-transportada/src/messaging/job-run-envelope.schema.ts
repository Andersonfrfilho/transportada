/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  JOB_EXECUTION_ORIGINS,
  SCHEDULED_JOBS,
  type ScheduledJob,
} from '../shared/job-catalog.constant.js'

/** A rota do trilho. O nome viaja na topologia, e mudá-lo é migração de fila, não renomeação. */
export const JOB_RUN_QUEUE_ROUTE = 'job-run.v1'

export const JOB_RUN_EVENT_TYPE = 'transportada.job.run.requested'

/**
 * ⚠️ Cópia por valor do envelope do cron, que é quem publica — as apps não importam código umas das
 * outras. Mudou um campo de um lado? mude do outro; a paridade é assertada nos dois
 * `test/job-run/envelope.contract.ts`, não suposta.
 *
 * O envelope carrega **referência**, não trabalho: quem sabe o que a rotina tem de fazer é a linha
 * de `job_executions`, e é ela que decide se este consumo roda ou é reentrega repetida.
 */
export const jobRunEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.literal(JOB_RUN_EVENT_TYPE),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    executionId: z.uuid(),
    job: z.enum(SCHEDULED_JOBS as unknown as [ScheduledJob, ...ScheduledJob[]]),
    origin: z.enum(JOB_EXECUTION_ORIGINS),
  }),
})

export type JobRunEnvelopeV1 = z.infer<typeof jobRunEnvelopeV1Schema>
