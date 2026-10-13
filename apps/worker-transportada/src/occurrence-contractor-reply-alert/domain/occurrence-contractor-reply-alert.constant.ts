/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const OCCURRENCE_CONTRACTOR_REPLY_ALERT_JOB = 'occurrence.contractor-reply.alert' as const

export const OCCURRENCE_CONTRACTOR_REPLY_ALERT_BATCH_SIZE = 10
export const OCCURRENCE_CONTRACTOR_REPLY_ALERT_MAX_PER_CYCLE = 100

/** O dedupe do módulo de notificações é permanente por chave: o número do alerta faz cada um valer. */
export const OCCURRENCE_CONTRACTOR_REPLY_ALERT_DEDUPE_PREFIX = 'reply:'
