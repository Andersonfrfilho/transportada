/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A distribuidora que atende a garagem é escolha da empresa, e ela é escolhida **de uma lista**: a
 * sigla da ANEEL não é adivinhável, e código digitado errado não falha de imediato — ele grava uma
 * linha que nunca vira preço, e a tela passa a mostrar distribuidora configurada com o elétrico
 * indisponível para sempre.
 *
 * A lista sai do que a coleta publicou. O caso difícil é a escolha que a coleta deixou de publicar —
 * distribuidora incorporada ou renomeada: ela continua na lista, nomeada pelo que se sabe dela, para
 * o operador ver o que está configurado antes de trocar. É a mesma decisão de
 * `buildVehicleCatalogChoices` e `buildMunicipalityChoices`: o que já está gravado vence o catálogo.
 */
import { DEFAULT_ENERGY_ADJUSTMENT_FACTOR } from '../../shared/energy-tariff.constant.js'

/** `taxId` nulo é a órfã: a escolha sobreviveu à publicação, e do CNPJ dela não sobrou registro. */
export type EnergyDistributor = {
  readonly code: string
  readonly taxId: string | null
}

export type CompanyEnergyChoice = {
  readonly adjustmentFactor: string
  readonly distributorCode: string
} | null

export type CompanyEnergySettings = {
  readonly adjustmentFactor: string
  readonly distributorCode: string | null
  readonly distributors: readonly EnergyDistributor[]
}

export function resolveCompanyEnergySettings(input: {
  readonly catalog: readonly EnergyDistributor[]
  readonly choice: CompanyEnergyChoice
}): CompanyEnergySettings {
  if (input.choice === null) {
    return {
      adjustmentFactor: DEFAULT_ENERGY_ADJUSTMENT_FACTOR,
      distributorCode: null,
      distributors: input.catalog,
    }
  }

  const chosen = input.choice.distributorCode
  const published = input.catalog.some((distributor) => distributor.code === chosen)

  return {
    adjustmentFactor: input.choice.adjustmentFactor,
    distributorCode: chosen,
    distributors: published ? input.catalog : [...input.catalog, { code: chosen, taxId: null }],
  }
}
