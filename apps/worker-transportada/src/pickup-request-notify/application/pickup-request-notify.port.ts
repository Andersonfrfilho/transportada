/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 339 T4: as portas da rotina `pickup-request.notify`.
 */
import type {
  PickupNotificationAudience,
  PickupNotificationEvent,
  PickupNotificationRequest,
} from '../domain/pickup-request-notify-message.policy.js'

export type PendingPickupNotification = {
  readonly attempts: number
  readonly audience: PickupNotificationAudience
  readonly channel: 'email' | 'whatsapp'
  readonly companyId: string
  readonly event: PickupNotificationEvent
  readonly id: string
  readonly request: PickupNotificationRequest & {
    readonly id: string
    readonly requesterEmail: string | null
    readonly requesterPhone: string | null
  }
}

export type PickupRequestNotifyPorts = {
  readonly delivery: {
    /** Lança se o provedor não aceitou. */
    email(input: {
      readonly body: string
      readonly companyId: string
      readonly idempotencyKey: string
      readonly subject: string
      readonly to: readonly string[]
    }): Promise<void>
    /** Quem, no escritório, recebe o aviso de pedido novo, cancelado ou parado. */
    officeEmails(input: { readonly companyId: string }): Promise<readonly string[]>
    /** Lança se o canal não está disponível. */
    whatsapp(input: {
      readonly body: string
      readonly companyId: string
      readonly number: string
    }): Promise<void>
  }
  /** Link do painel (escritório) e do portal (cliente); nulo → o aviso sai sem o botão. */
  readonly links: { readonly office: string | null; readonly portal: string | null }
  readonly outbox: {
    /** Reserva até `limit` avisos vencidos (SKIP LOCKED): outra rotina ao mesmo tempo não pega os mesmos. */
    claim(input: {
      readonly limit: number
      readonly now: Date
    }): Promise<readonly PendingPickupNotification[]>
    markFailed(input: { readonly error: string; readonly id: string }): Promise<void>
    markRetry(input: {
      readonly availableAt: Date
      readonly error: string
      readonly id: string
    }): Promise<void>
    markSent(input: { readonly id: string; readonly now: Date }): Promise<void>
    markSkipped(input: { readonly id: string; readonly reason: string }): Promise<void>
  }
  readonly sweep: {
    /** Expira o pedido sem decisão e grava o aviso ao cliente; devolve quantos expirou. */
    expireDue(input: { readonly now: Date }): Promise<number>
    /** Marca (uma vez) o pedido parado e grava o aviso ao escritório; devolve quantos marcou. */
    markStale(input: { readonly now: Date; readonly olderThanHours: number }): Promise<number>
  }
}
