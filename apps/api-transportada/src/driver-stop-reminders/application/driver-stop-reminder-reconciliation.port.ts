/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DriverStopReminderStage } from '../../shared/driver-stop-reminder.constant.js'

/** A etapa em que a parada está agora e que ainda não tem lembrete para a mesma âncora. */
export type CurrentStopReminderStage = {
  readonly stopId: string
  readonly tripId: string
  readonly driverId: string
  readonly stage: DriverStopReminderStage
  readonly anchorAt: Date
}

export type DriverStopReminderReconciliationRepository = {
  /**
   * Viagem na rua de empresa com a chave ligada: parada a caminho (`arrival`, âncora na saída) ou com chegada
   * sem baixa (`settlement`, âncora na chegada). Some a etapa que já teve lembrete, em qualquer status, para a
   * mesma âncora.
   */
  listMissingCurrentStages(params: {
    readonly companyId: string
  }): Promise<readonly CurrentStopReminderStage[]>
}
