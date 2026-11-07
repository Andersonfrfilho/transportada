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

/**
 * O passo que espera a resposta do motorista (1–4), aberto **antes** do envio. A entrega só conhece esta porta:
 * a T2.3 liga a implementação do grupo ao `GROUP_STEP_REGISTRY` (`reminder.stage`).
 */
export type ReminderPromptOpener = {
  open(params: OpenReminderPromptParams): Promise<void>
}
