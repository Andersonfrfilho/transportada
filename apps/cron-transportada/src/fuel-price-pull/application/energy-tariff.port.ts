/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A chave natural `(distribuidora, subgrupo, modalidade, início da vigência)` **não é única na
 * fonte**: sete pares saem repetidos com `DscREH` diferente — retificação da mesma vigência, com
 * valor corrigido. Por isso a gravação é upsert e não "insere o que falta": ignorar o conflito
 * congelaria a tarifa errada até a vigência seguinte. Dado público de mercado — sem `companyId`.
 */
import type { EnergyTariffRecord } from '../domain/aneel-tariff.policy.js'

export type { EnergyTariffRecord }

export type EnergyTariffGatewayPort = {
  readonly upsertCurrent: (input: {
    readonly collectedAt: Date
    readonly tariffs: readonly EnergyTariffRecord[]
  }) => Promise<{ readonly writtenCount: number }>
}
