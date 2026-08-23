/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O que a coleta pede é o que vale **hoje**: a fonte publica o histórico inteiro, e a seleção do
 * dia mora no domínio, não no gateway. Coleta que falha não chega ao banco — a tarifa da vigência
 * anterior continua de pé.
 */
import type { EnergyTariffSelection } from '../domain/aneel-tariff.policy.js'

export type EnergyTariffSeriesPort = {
  readonly fetchCurrentTariffs: (input: {
    readonly onDay: string
  }) => Promise<EnergyTariffSelection>
}
