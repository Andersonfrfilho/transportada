/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  JOB_EXECUTION_ORIGINS,
  SCHEDULED_JOBS,
  type ScheduledJob,
} from '../../shared/job-catalog.constant.js'
import { JOB_RUN_EVENT_TYPE } from './tick.constant.js'

/**
 * O envelope carrega **referência**, nunca assunto de rotina: o executor lê o que precisa do banco
 * pelo `executionId`. O que a rotina faz — empresa, nota, credencial — não atravessa o broker.
 *
 * ⚠️ Cópia por valor do envelope do worker, que é quem o consome: as duas apps não importam código
 * uma da outra. Mudou um campo aqui? mude lá.
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
