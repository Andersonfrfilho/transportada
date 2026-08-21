/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  FLEET_VERSION_CONFLICT_ERROR,
  FREIGHT_REGION_CODE_PATTERN,
} from '../../src/modules/fleet/shared/fleet.constant'
import {
  FREIGHT_REGION_FORM_ERROR,
  buildFreightRegionBody,
  emptyFreightRegionForm,
  toFreightRegionForm,
} from '../../src/modules/fleet/shared/freightRegionForm.service'
import type { FreightRegionFormState } from '../../src/modules/fleet/shared/freightRegionForm.service'
import type { FreightRegion } from '../../src/modules/fleet/shared/freightRegion.types'
import { FREIGHT_VEHICLE_CLASSES } from '../../src/modules/shared/freightClass.constant'

function formWith(overrides: Partial<FreightRegionFormState>): FreightRegionFormState {
  return { ...emptyFreightRegionForm(), code: '1.000', name: 'Barretos Zona 1', ...overrides }
}

function expectFailure(state: FreightRegionFormState): readonly string[] {
  const result = buildFreightRegionBody(state)
  if (result.ok) throw new Error('esperava recusa e o corpo foi montado')
  return result.errors
}

function expectBody(state: FreightRegionFormState) {
  const result = buildFreightRegionBody(state)
  if (!result.ok) throw new Error(`esperava corpo e veio recusa: ${result.errors.join(', ')}`)
  return result.body
}

describe('freight region form contract', () => {
  test('a grade nasce com as seis classes da tabela impressa, na ordem dela', () => {
    expect(Object.keys(emptyFreightRegionForm().rates)).toEqual([...FREIGHT_VEHICLE_CLASSES])
  })

  /**
   * A coluna UTILITÁRIO da tabela real é zero em toda rota fora da matriz, e o parser de importação
   * já descarta a célula zerada (`if (Number(value) === 0) continue`). A tela grava pela mesma
   * regra: campo vazio é "não atende", e um `0.0000` gravado seria preço de graça.
   */
  test('classe sem valor e classe zerada não viram linha de preço', () => {
    const body = expectBody(
      formWith({
        rates: { ...emptyFreightRegionForm().rates, toco: '1.240,00', utility: '', van: '0,00' },
      }),
    )

    expect(body.rates).toEqual([{ driverAmount: '1240.0000', freightClass: 'toco' }])
  })

  test('o valor sai na escala de quatro casas que a API exige', () => {
    const body = expectBody(
      formWith({ rates: { ...emptyFreightRegionForm().rates, truck: '540,50' } }),
    )

    expect(body.rates).toEqual([{ driverAmount: '540.5000', freightClass: 'truck' }])
  })

  test('o código fora do padrão da rota é recusado antes do envio', () => {
    expect(FREIGHT_REGION_CODE_PATTERN.test('1.000')).toBe(true)
    expect(FREIGHT_REGION_CODE_PATTERN.test('1.004')).toBe(false)
    expect(expectFailure(formWith({ code: '1.004' }))).toContain(
      FREIGHT_REGION_FORM_ERROR.CODE_INVALID,
    )
    expect(expectFailure(formWith({ code: '' }))).toContain(FREIGHT_REGION_FORM_ERROR.CODE_INVALID)
  })

  test('a rota sem nome é recusada antes do envio', () => {
    expect(expectFailure(formWith({ name: '   ' }))).toContain(
      FREIGHT_REGION_FORM_ERROR.NAME_REQUIRED,
    )
  })

  /**
   * BARRINHA/SP pode estar em duas rotas — é a unicidade `(company_id, region_id, city, state)` que
   * a 045 fixou. Duas vezes na **mesma** rota é digitação repetida, e a API a recusa com um 400
   * genérico: dizer aqui é dizer qual cidade.
   */
  test('a mesma cidade duas vezes na mesma rota é recusada, mesmo escrita diferente', () => {
    const errors = expectFailure(
      formWith({
        cities: [
          { city: 'BARRINHA', state: 'SP' },
          { city: 'Barrinha', state: 'SP' },
        ],
      }),
    )

    expect(errors).toContain(FREIGHT_REGION_FORM_ERROR.CITY_DUPLICATED)
  })

  test('a mesma cidade em UFs diferentes convive na rota', () => {
    const body = expectBody(
      formWith({
        cities: [
          { city: 'BARRINHA', state: 'SP' },
          { city: 'BARRINHA', state: 'MG' },
        ],
      }),
    )

    expect(body.cities).toHaveLength(2)
  })

  /** Rota sem cidade é cadastro em andamento, e a API a aceita: recusar aqui inventaria regra. */
  test('a rota ainda sem cidade é aceita', () => {
    expect(expectBody(formWith({ cities: [] })).cities).toEqual([])
  })

  test('o corpo não carrega chave que o strict() da API recusaria', () => {
    expect(Object.keys(expectBody(formWith({}))).sort()).toEqual([
      'cities',
      'code',
      'name',
      'rates',
    ])
  })

  test('abrir uma rota existente devolve o valor no campo, e a classe sem preço em branco', () => {
    const region: FreightRegion = {
      cities: [{ city: 'COLINA', state: 'SP' }],
      code: '1.001',
      createdAt: '2026-08-20T00:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Barretos Zona 2',
      rates: [{ driverAmount: '620.0000', freightClass: 'van' }],
      status: 'active',
      updatedAt: '2026-08-20T00:00:00.000Z',
      version: '3',
      zone: 2,
    }

    const form = toFreightRegionForm(region)

    expect(form.code).toBe('1.001')
    expect(form.rates.van).toBe('620,00')
    expect(form.rates.utility).toBe('')
    expect(form.cities).toEqual([{ city: 'COLINA', state: 'SP' }])
  })

  /** Sem o código na lista, o 409 da rota volta como "falha na requisição" e some o motivo. */
  test('o conflito de versão da rota é reconhecido como conflito, não como erro cru', () => {
    expect(FLEET_VERSION_CONFLICT_ERROR).toContain('FREIGHT_REGION_VERSION_CONFLICT')
  })
})
