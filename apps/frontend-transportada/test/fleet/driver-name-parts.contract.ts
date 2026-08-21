/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  joinDriverName,
  splitDriverName,
} from '../../src/modules/fleet/shared/driverName.service.js'
import { DRIVER_FORM_KEYS } from '../../src/modules/fleet/shared/fleet.constant.js'
import {
  createDriverDraft,
  toDriverBody,
  toDriverFormState,
} from '../../src/modules/fleet/shared/fleetForm.service.js'
import type { FleetDriverDetail } from '../../src/modules/fleet/shared/fleet.types.js'
import { DRIVER_DETAIL } from './fleet.fixture.js'

const loadedDriver = DRIVER_DETAIL as unknown as FleetDriverDetail

describe('o nome se parte em nome e sobrenome', () => {
  test('o primeiro espaço separa: o resto todo é sobrenome', () => {
    expect(splitDriverName('João da Silva Souza')).toEqual({
      givenName: 'João',
      surname: 'da Silva Souza',
    })
  })

  test('nome de uma palavra fica sem sobrenome', () => {
    expect(splitDriverName('Ana')).toEqual({ givenName: 'Ana', surname: '' })
  })

  test('ficha sem nome não inventa parte nenhuma', () => {
    expect(splitDriverName('')).toEqual({ givenName: '', surname: '' })
  })

  test('espaço repetido não vira sobrenome que começa com espaço', () => {
    expect(splitDriverName('  Maria   Clara  ')).toEqual({
      givenName: 'Maria',
      surname: 'Clara',
    })
  })
})

describe('as duas partes voltam a ser um nome só', () => {
  test('o espaço entra entre as partes', () => {
    expect(joinDriverName({ givenName: 'João', surname: 'da Silva' })).toBe('João da Silva')
  })

  test('sobrenome vazio não deixa espaço sobrando no fim', () => {
    expect(joinDriverName({ givenName: 'Ana', surname: '' })).toBe('Ana')
  })

  test('nome vazio não deixa espaço sobrando no início', () => {
    expect(joinDriverName({ givenName: '', surname: 'Souza' })).toBe('Souza')
  })
})

/**
 * A coluna continua sendo uma só (`fleet_drivers.name`): partir no primeiro espaço e juntar com um
 * espaço é reversível, então abrir e salvar a ficha não degrada o nome que o MDF-e já lê.
 */
describe('partir e juntar não perde o nome gravado', () => {
  test('o ciclo devolve exatamente o nome de origem', () => {
    for (const name of ['Ana', 'João da Silva Souza', 'Maria Clara', '']) {
      expect(joinDriverName(splitDriverName(name))).toBe(name)
    }
  })

  test('a ficha carregada abre com o nome partido nos dois campos', () => {
    const state = toDriverFormState({ ...loadedDriver, name: 'João da Silva Souza' })

    expect(state.name).toBe('João')
    expect(state.surname).toBe('da Silva Souza')
  })

  test('o corpo enviado junta os dois campos num nome só', () => {
    const state = createDriverDraft({ name: 'João', surname: 'da Silva Souza' })

    expect(toDriverBody(state).name).toBe('João da Silva Souza')
  })

  test('o sobrenome é campo do formulário e não do corpo da API', () => {
    expect(DRIVER_FORM_KEYS).toContain('surname')
    expect(Object.keys(toDriverBody(createDriverDraft()))).not.toContain('surname')
  })
})
