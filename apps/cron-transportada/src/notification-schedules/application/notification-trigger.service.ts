/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { NOTIFICATION_DEFAULT_LOCALE } from '../domain/notification-schedules.constant.js'
import type { NotificationTriggerInput } from '../domain/notification-trigger.policy.js'

export type NotificationSendPort = (params: {
  readonly category: string
  readonly companyId: string
  readonly dedupeKey: string
  readonly locale: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly recipientUserId: string
  readonly templateKey: string
}) => Promise<unknown>

export type NotificationTriggerLogger = {
  error(message: string, meta?: Readonly<Record<string, unknown>>): void
  info(message: string, meta?: Readonly<Record<string, unknown>>): void
  warn(message: string, meta?: Readonly<Record<string, unknown>>): void
}

export type NotificationTrigger = {
  notify(input: NotificationTriggerInput): Promise<void>
}

/**
 * O aviso é efeito colateral do processamento fiscal, e não pode decidir o destino da mensagem:
 * o CT-e já foi liquidado quando o disparo acontece. Falha de notificação vira log, não exceção.
 */
export function createNotificationTrigger({
  logger,
  send,
}: {
  readonly logger: NotificationTriggerLogger
  readonly send: NotificationSendPort
}): NotificationTrigger {
  return {
    async notify(input) {
      try {
        await send({
          category: input.category,
          companyId: input.companyId,
          dedupeKey: input.dedupeKey,
          locale: NOTIFICATION_DEFAULT_LOCALE,
          payload: input.payload,
          recipientUserId: input.recipientUserId,
          templateKey: input.templateKey,
        })
      } catch (error) {
        logger.warn('notification_trigger_failed', {
          companyId: input.companyId,
          dedupeKey: input.dedupeKey,
          reason: error instanceof Error ? error.message : 'unknown',
          templateKey: input.templateKey,
        })
      }
    },
  }
}
