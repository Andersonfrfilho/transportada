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

/** A etapa que a varredura quer abrir, com o prazo já calculado pela regra. */
export type OpenCurrentStopReminderParams = {
  readonly companyId: string
  readonly stopId: string
  readonly stage: DriverStopReminderStage
  readonly expectedAt: Date
  readonly dueAt: Date
}

export type DriverStopReminderReconciliationRepository = {
  /**
   * Viagem na rua de empresa com a chave ligada: parada a caminho (`arrival`) ou com chegada sem baixa
   * (`settlement`). Some a etapa cujo ciclo (última saída/chegada registrada) já teve lembrete, em qualquer
   * status. No máximo `limit` por chamada, as de âncora mais antiga: o resto fica para o próximo ciclo.
   */
  listMissingCurrentStages(params: {
    readonly companyId: string
    readonly limit: number
  }): Promise<readonly CurrentStopReminderStage[]>
  /**
   * `INSERT … SELECT` único com os mesmos predicados da listagem: a parada que andou entre a leitura e a
   * escrita, ou cujo ciclo já foi lembrado, não gera `pending` velho. Devolve `undefined` quando nada entrou.
   */
  openIfStillCurrent(
    params: OpenCurrentStopReminderParams,
  ): Promise<{ readonly id: string } | undefined>
}
