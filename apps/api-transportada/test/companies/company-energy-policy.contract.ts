/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A escolha da distribuidora é de lista, nunca de campo livre: a sigla da ANEEL não é adivinhável, e
 * código digitado errado não falha — ele grava uma linha que nunca vira preço. O que a política
 * decide é o que a lista oferece, e a regra difícil é a escolha que a coleta deixou de publicar.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveCompanyEnergySettings,
  type EnergyDistributor,
} from '../../src/companies/domain/company-energy.policy'
import { DEFAULT_ENERGY_ADJUSTMENT_FACTOR } from '../../src/shared/energy-tariff.constant'

const CERACA: EnergyDistributor = { code: 'CERACA', taxId: '12345678000195' }
const CPFL: EnergyDistributor = { code: 'CPFL-PAULISTA', taxId: '33050196000188' }
const CATALOG: readonly EnergyDistributor[] = [CERACA, CPFL]

describe('company energy settings policy', () => {
  test('offers the whole catalog and the neutral factor while the company has not chosen', () => {
    expect(resolveCompanyEnergySettings({ catalog: CATALOG, choice: null })).toEqual({
      adjustmentFactor: DEFAULT_ENERGY_ADJUSTMENT_FACTOR,
      distributorCode: null,
      distributors: CATALOG,
    })
  })

  test('answers the choice as it was saved, without growing the catalog', () => {
    expect(
      resolveCompanyEnergySettings({
        catalog: CATALOG,
        choice: { adjustmentFactor: '1.3500', distributorCode: 'CPFL-PAULISTA' },
      }),
    ).toEqual({
      adjustmentFactor: '1.3500',
      distributorCode: 'CPFL-PAULISTA',
      distributors: CATALOG,
    })
  })

  /**
   * Distribuidora incorporada ou renomeada some da publicação e a escolha gravada fica órfã. Tirá-la
   * da lista deixaria o select mostrando o placeholder com escolha salva — o operador não veria o que
   * está configurado, e é justamente o que ele precisa trocar.
   */
  test('keeps a choice the collection no longer publishes, named without a tax id', () => {
    const settings = resolveCompanyEnergySettings({
      catalog: CATALOG,
      choice: { adjustmentFactor: '1.0000', distributorCode: 'ENERGISA-BORBOREMA' },
    })

    expect(settings.distributorCode).toBe('ENERGISA-BORBOREMA')
    expect(settings.distributors).toEqual([...CATALOG, { code: 'ENERGISA-BORBOREMA', taxId: null }])
  })

  test('preserves the order the collection gave the catalog', () => {
    const settings = resolveCompanyEnergySettings({
      catalog: [CPFL, CERACA],
      choice: { adjustmentFactor: '1.0000', distributorCode: 'CERACA' },
    })

    expect(settings.distributors.map((distributor) => distributor.code)).toEqual([
      'CPFL-PAULISTA',
      'CERACA',
    ])
  })

  test('never lists an empty catalog as if a choice existed', () => {
    expect(resolveCompanyEnergySettings({ catalog: [], choice: null }).distributors).toEqual([])
  })
})
