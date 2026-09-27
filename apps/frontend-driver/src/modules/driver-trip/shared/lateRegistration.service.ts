/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTripStop } from './driverTrip.types'
import { countPendingDocuments } from './driverTripView.service'

/**
 * Pedido do usuário (25/09): quem não tocou "Cheguei" na hora ainda precisa registrar a entrega —
 * "Registrar entrega depois" só aparece na parada que ainda não libera as ações (sem chegada, sem
 * confirmação anterior) e que tem nota para agir. Sem nota pendente não há o que a confirmação
 * liberaria, e com as ações já liberadas o link seria redundante.
 */
export function canOfferLateRegistration(input: {
  readonly canActOnDocuments: boolean
  readonly stop: DriverTripStop
}): boolean {
  return !input.canActOnDocuments && countPendingDocuments(input.stop) > 0
}

/**
 * A API ainda recusa a chave `lateRegistration` (schemas `.strict()`, 400) — o corpo só leva o
 * campo quando `isFieldEnabled` liga (o dia em que a API aceitar) **e** o motorista de fato
 * confirmou o registro tardio. Parametrizado (em vez de ler a constante direto) para o contrato
 * provar as duas metades sem precisar mockar módulo.
 */
export function shouldSendLateRegistration(input: {
  readonly isFieldEnabled: boolean
  readonly lateRegistration: boolean | undefined
}): boolean {
  return input.isFieldEnabled && input.lateRegistration === true
}
