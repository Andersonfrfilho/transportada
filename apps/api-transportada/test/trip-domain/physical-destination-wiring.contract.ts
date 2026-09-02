/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { buildStopAddressKey } from '../../src/trips/domain/stop-address-key.js'
import {
  chooseNfeDestinationRow,
  type NfeDestinationRow,
} from '../../src/trips/domain/nfe-destination-choice.policy.js'

const CADASTRO: NfeDestinationRow = {
  city: 'Santa Barbara d Oeste',
  cityCode: '3549102',
  number: '400',
  postalCode: '13872400',
  role: 'recipient',
  state: 'SP',
  street: 'Rua do Cadastro',
}

const ENTREGA: NfeDestinationRow = {
  city: 'Campinas',
  cityCode: '3509502',
  number: '4500',
  postalCode: '13052000',
  role: 'delivery',
  state: 'SP',
  street: 'Rua da Doca',
}

describe('trip stop destination (spec 073 P1/CA1, CA2)', () => {
  it('groups the stop by the delivery address when the note carries one', () => {
    const chosen = chooseNfeDestinationRow([CADASTRO, ENTREGA])

    expect(chosen?.origin).toBe('delivery')
    expect(buildStopAddressKey(chosen!.components)).toBe('3509502|13052000|4500')
  })

  /** 345 de 345 notas reais: sem `<entrega>`, a parada é exatamente a de hoje. */
  it('keeps today’s stop when there is no delivery address', () => {
    const chosen = chooseNfeDestinationRow([CADASTRO])

    expect(chosen?.origin).toBe('recipient')
    expect(buildStopAddressKey(chosen!.components)).toBe('3549102|13872400|400')
  })

  /**
   * Duas notas do mesmo cliente, uma com `<entrega>` e outra sem, são **dois portões** — e por
   * isso duas paradas. Agrupá-las seria mandar o motorista descarregar tudo num lugar só.
   */
  it('sends two notes of the same client to two different stops', () => {
    const comEntrega = chooseNfeDestinationRow([CADASTRO, ENTREGA])
    const semEntrega = chooseNfeDestinationRow([CADASTRO])

    expect(buildStopAddressKey(comEntrega!.components)).not.toBe(
      buildStopAddressKey(semEntrega!.components),
    )
  })

  /** O rótulo da parada acompanha o endereço escolhido — senão a tela nomeia o lugar errado. */
  it('labels the stop with the chosen address, not the other one', () => {
    expect(chooseNfeDestinationRow([CADASTRO, ENTREGA])?.label).toBe('Rua da Doca, Campinas, SP')
  })

  it('returns null when the note resolves to no destination party', () => {
    expect(chooseNfeDestinationRow([])).toBeNull()
  })

  /**
   * A fiação se cobra por texto de fonte: a consulta que alimenta a parada não pode voltar a
   * prender o papel `recipient` — isso compila, passa em todo teste de caminho feliz, e leva o
   * motorista à porta errada só na nota que traz `<entrega>`.
   */
  it('never pins the recipient role in the query that feeds the stop', () => {
    const source = readFileSync(
      new URL('../../src/trips/infrastructure/nfe-destination-address.support.ts', import.meta.url),
      'utf8',
    )

    expect(source).not.toInclude("'recipient'")
    expect(source).toInclude('destinationRolesFilter')
    expect(source).toInclude('chooseNfeDestinationRow')
  })
})

describe('manual override precedence (spec 073 P4/CA4)', () => {
  const source = readFileSync(
    new URL(
      '../../src/trips/infrastructure/drizzle-delivery-address-override.repository.ts',
      import.meta.url,
    ),
    'utf8',
  )

  /**
   * A ordem é `desvio manual → <entrega> → <enderDest>`: decisão de pessoa está acima de dado
   * fiscal. Ela é estrutural — o último desvio retorna antes de a nota ser consultada —, e é essa
   * estrutura que o contrato trava: inverter a ordem faria o desvio ser sobrescrito pela nota.
   */
  it('returns the last manual override before ever reading the note', () => {
    const overrideReturn = source.indexOf('label: lastOverride.label')
    const noteQuery = source.indexOf('destinationRolesFilter(nfeParticipants.role)')

    expect(overrideReturn).toBeGreaterThan(0)
    expect(noteQuery).toBeGreaterThan(overrideReturn)
  })

  /** E a base do desvio é o endereço físico, não o cadastro do cliente. */
  it('bases the override on the physical destination', () => {
    expect(source).not.toInclude("'recipient'")
    expect(source).toInclude('chooseNfeDestinationRow')
  })
})
