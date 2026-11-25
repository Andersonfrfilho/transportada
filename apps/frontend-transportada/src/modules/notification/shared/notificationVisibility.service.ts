/* Copyright (c) 2026 Ada Technology. MIT License. */

/** O dia da transportadora é o de Brasília, não o do aparelho nem o UTC do servidor. */
export const NOTIFICATION_DAY_TIME_ZONE = 'America/Sao_Paulo'

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: NOTIFICATION_DAY_TIME_ZONE,
  year: 'numeric',
})

/** `YYYY-MM-DD` no fuso de Brasília; data inválida devolve `undefined`. */
export function toNotificationDay(value: Date | string): string | undefined {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : dayFormatter.format(date)
}

export type NotificationVisibilityInput = Readonly<{ readAt?: string | null | undefined }>

/**
 * Notificação lida só aparece se foi lida hoje; a não lida sempre aparece. `readAt` ilegível
 * esconde: na dúvida, não deixa lixo antigo na lista.
 */
export function isNotificationVisible(
  notification: NotificationVisibilityInput,
  now: Date = new Date(),
): boolean {
  if (notification.readAt === undefined || notification.readAt === null) return true
  const readDay = toNotificationDay(notification.readAt)
  return readDay !== undefined && readDay === toNotificationDay(now)
}
