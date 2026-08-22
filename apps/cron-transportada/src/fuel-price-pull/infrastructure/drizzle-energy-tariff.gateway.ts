/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Upsert pela chave natural, não "insere o que falta": a própria ANEEL republica a mesma vigência
 * retificada — sete pares medidos em 21/08/2026 —, e ignorar o conflito manteria o valor errado no
 * ar até a vigência seguinte. Reexecutar o mesmo dia reescreve o mesmo valor, sem duplicar linha.
 */
import { sql } from 'drizzle-orm'

import type { CronDatabase } from '../../database/cron-database.types.js'
import { energyTariffReferences } from '../../database/energy-tariff.schema.js'
import type { EnergyTariffGatewayPort } from '../application/energy-tariff.port.js'

export function createDrizzleEnergyTariffGateway(dependencies: {
  readonly db: CronDatabase
}): EnergyTariffGatewayPort {
  return {
    async upsertCurrent(input) {
      if (input.tariffs.length === 0) {
        return { writtenCount: 0 }
      }

      const written = await dependencies.db
        .insert(energyTariffReferences)
        .values(
          input.tariffs.map((tariff) => ({
            collectedAt: input.collectedAt,
            distributorCode: tariff.distributorCode,
            distributorTaxId: tariff.distributorTaxId,
            effectiveFrom: tariff.effectiveFrom,
            effectiveTo: tariff.effectiveTo,
            modality: tariff.modality,
            subgroup: tariff.subgroup,
            tePerMegawattHour: tariff.tePerMegawattHour,
            tusdPerMegawattHour: tariff.tusdPerMegawattHour,
          })),
        )
        .onConflictDoUpdate({
          set: {
            collectedAt: input.collectedAt,
            distributorTaxId: sql`excluded.distributor_tax_id`,
            effectiveTo: sql`excluded.effective_to`,
            tePerMegawattHour: sql`excluded.te_per_megawatt_hour`,
            tusdPerMegawattHour: sql`excluded.tusd_per_megawatt_hour`,
          },
          target: [
            energyTariffReferences.distributorCode,
            energyTariffReferences.subgroup,
            energyTariffReferences.modality,
            energyTariffReferences.effectiveFrom,
          ],
        })
        .returning({ id: energyTariffReferences.id })

      return { writtenCount: written.length }
    },
  }
}
