/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DriverStopReminderChannel,
  DriverStopReminderStage,
} from '../../shared/driver-stop-reminder.constant.js'

/** O canal de WhatsApp em que o lembrete é pedido: o grupo do motorista ou a conversa individual. */
export type DriverReminderChannelKind = 'direct' | 'group'

export type ResolveDriverReminderChannelParams = {
  readonly companyId: string
  readonly driverId: string
}

/** Spec 299 D5: o último canal de WhatsApp que o motorista usou; sem nenhum, grupo. Sempre por empresa. */
export type DriverReminderChannelResolver = {
  resolve(params: ResolveDriverReminderChannelParams): Promise<DriverReminderChannelKind>
}

export type SendDirectReminderParams = {
  readonly body: string
  readonly companyId: string
  readonly driverId: string
  readonly reminderId: string
  readonly stage: DriverStopReminderStage
  readonly tripStopId: string
}

export type SendDirectReminderResult =
  | {
      readonly channel: Exclude<DriverStopReminderChannel, 'group'>
      readonly providerMessageId: string | null
      readonly status: 'sent'
    }
  /** Nada foi enviado nem gravado: a entrega segue pelo grupo na mesma tentativa. */
  | { readonly status: 'unavailable' }

/** O envio na conversa individual (texto livre na janela de 24 h, template fora dela): implementado na Fase 3. */
export type DirectReminderSender = {
  send(params: SendDirectReminderParams): Promise<SendDirectReminderResult>
}
