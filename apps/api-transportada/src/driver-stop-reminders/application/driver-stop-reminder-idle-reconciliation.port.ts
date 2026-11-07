/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** A parada suposta de uma viagem na rua parada (sem saída, chegada nem baixa em aberto) e o início do ciclo. */
export type IdleStopReminderCandidate = {
  readonly stopId: string
  readonly tripId: string
  readonly driverId: string
  readonly anchorAt: Date
}

export type DriverStopReminderIdleReconciliationRepository = {
  /**
   * Viagem `on_delivery_route` de empresa com a chave ligada, sem parada a caminho nem com chegada em aberto: a próxima
   * parada aberta na ordem da rota, com âncora na última baixa ou, sem baixa, no despacho. Some o ciclo que já teve
   * lembrete `idle` (de qualquer status) para a parada, com âncora a partir do início do ciclo.
   */
  listMissingIdleStages(params: {
    readonly companyId: string
  }): Promise<readonly IdleStopReminderCandidate[]>
}
