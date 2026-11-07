/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DriverStopReminderStage } from '../../shared/driver-stop-reminder.constant.js'

export type OpenReminderPromptParams = {
  readonly companyId: string
  readonly reminderId: string
  readonly tripStopId: string
  readonly driverId: string
  readonly groupJid: string
  readonly stage: DriverStopReminderStage
}

export type DiscardReminderPromptParams = Pick<
  OpenReminderPromptParams,
  'companyId' | 'groupJid' | 'reminderId'
>

/**
 * O passo que espera a resposta do motorista (1–4), aberto **antes** do envio (grupo: `reminder.stage` do
 * `GROUP_STEP_REGISTRY`). `open` lança `ReminderPromptBusyError` quando o grupo já tem outro pedido aberto: a entrega
 * então não envia. `discard` fecha o passo que este lembrete abriu quando o envio falhou.
 */
export type ReminderPromptOpener = {
  open(params: OpenReminderPromptParams): Promise<void>
  discard(params: DiscardReminderPromptParams): Promise<void>
}
