/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const NOTIFICATION_SCHEDULES_JOB = 'notification.schedules.run'

/**
 * ⚠️ Cópia por valor de `api-transportada/src/notification/notification.constant.ts`. A API publica,
 * o worker consome e este job reenfileira o que venceu — os três precisam nomear a mesma trilha, e
 * nenhuma app importa código da outra.
 */
export const NOTIFICATION_QUEUE_ROUTE = 'notification.v1'
export const NOTIFICATION_QUEUE_PREFETCH = 1

export const NOTIFICATION_DEFAULT_LOCALE = 'pt-BR'
export const NOTIFICATION_DEFAULT_TIMEZONE = 'America/Sao_Paulo'
