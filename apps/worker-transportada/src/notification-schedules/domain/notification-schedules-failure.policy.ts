/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A ponte entre o que cai aqui dentro e as duas palavras que o catálogo desta rotina publica. O que
 * não tem nome fecha em `unexpected_error` de propósito: inventar `queue_unreachable` para todo erro
 * desconhecido diria ao operador para olhar o broker enquanto o defeito está em outro lugar.
 */
import { NotificationQueueUnreachableError } from '../../notification/domain/notification-queue.error.js'
import type { JobOutcome } from '../../shared/job-catalog.constant.js'

/**
 * Em ordem de precedência: quando o ciclo cai por mais de uma causa, ele fecha pela primeira desta
 * lista. Modelo sem cadastro depende de alguém; broker fora do ar passa sozinho.
 */
export const NOTIFICATION_SCHEDULES_FAILURE_OUTCOMES = [
  'template_missing',
  'queue_unreachable',
] as const satisfies readonly JobOutcome[]

export type NotificationSchedulesFailureOutcome =
  (typeof NOTIFICATION_SCHEDULES_FAILURE_OUTCOMES)[number]

export const NOTIFICATION_SCHEDULES_FAILURE_CAUSES = [
  ...NOTIFICATION_SCHEDULES_FAILURE_OUTCOMES,
  'unknown',
] as const

export type NotificationSchedulesFailureCause =
  (typeof NOTIFICATION_SCHEDULES_FAILURE_CAUSES)[number]

/** O código que o módulo de notificação carrega quando o cadastro do modelo não existe. */
const TEMPLATE_NOT_FOUND_CODE = 'NOTIFICATION_TEMPLATE_NOT_FOUND'

function hasTemplateNotFoundCode(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code: unknown }).code === TEMPLATE_NOT_FOUND_CODE
  )
}

export function toNotificationSchedulesFailureCause(
  error: unknown,
): NotificationSchedulesFailureCause {
  if (error instanceof NotificationQueueUnreachableError) return 'queue_unreachable'
  if (hasTemplateNotFoundCode(error)) return 'template_missing'
  return 'unknown'
}

export function toNotificationSchedulesOutcome(
  cause: NotificationSchedulesFailureCause,
): JobOutcome {
  return cause === 'unknown' ? 'unexpected_error' : cause
}
