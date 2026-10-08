/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ScheduledJob } from '../../shared/job-catalog.constant.js'

export const NFE_RECIPIENT_EMAIL_BACKFILL_JOB: ScheduledJob = 'nfe.recipient-email.backfill'

/** Cada nota custa uma leitura do bucket, então o lote é o teto de leituras simultâneas. */
export const NFE_RECIPIENT_EMAIL_BACKFILL_BATCH_SIZE = 50
