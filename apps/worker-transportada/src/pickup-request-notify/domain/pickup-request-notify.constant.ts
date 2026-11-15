/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 339 T4: a rotina que entrega os avisos do pedido de coleta/entrega. ⚠️ O prazo do alerta é cópia por valor de
 * `PICKUP_REQUEST_STALE_ALERT_HOURS` da API (`pickup-requests/domain/pickup-request.policy.ts`); a paridade é cobrada por
 * `test/pickup-request-notify.contract.test.ts`.
 */
export const PICKUP_REQUEST_NOTIFY_JOB = 'pickup-request.notify' as const

/** Horas sem decisão até o escritório ser alertado, uma vez só. */
export const PICKUP_REQUEST_STALE_ALERT_HOURS = 24

/** Quantos avisos a rotina entrega por ciclo; o resto espera o ciclo seguinte (nunca perde). */
export const PICKUP_NOTIFY_BATCH_SIZE = 100

/** Tentativas até desistir de um aviso, e o intervalo (minutos) antes de cada nova tentativa. */
export const PICKUP_NOTIFY_MAX_ATTEMPTS = 5
export const PICKUP_NOTIFY_RETRY_MINUTES = [2, 10, 30, 120, 480] as const

/** O aviso reservado ao ciclo fica invisível aos outros por este tempo; se o ciclo morrer, volta sozinho. */
export const PICKUP_NOTIFY_LEASE_MINUTES = 10
