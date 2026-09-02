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

describe('destination origin is persisted on the link (spec 073 P4/CA10, T019)', () => {
  const repository = readFileSync(
    new URL('../../src/trips/infrastructure/drizzle-trip.repository.ts', import.meta.url),
    'utf8',
  )

  /**
   * A origem era **calculada e descartada**: `chooseNfeDestinationRow` já a devolvia, e o vínculo
   * chamava `reconcileStopOnLink` sem ela. Compila, passa em tudo, e a tela nunca sabe por que o
   * motorista foi parar naquele portão.
   */
  it('writes the origin into the link instead of dropping it', () => {
    expect(repository).toInclude('destinationOrigin')
  })

  /**
   * A origem **não é da parada**: uma parada agrupa várias notas, e a mesma chave pode ser
   * alcançada pela entrega de uma e pelo cadastro de outra. Guardá-la em `trip_stops` faria a tela
   * mentir na primeira parada mista — o lugar é o vínculo.
   */
  it('never puts the origin on the stop, which would lie on a mixed stop', () => {
    const stops = readFileSync(
      new URL('../../src/database/trip.schema.ts', import.meta.url),
      'utf8',
    )
    const stopTable = stops.slice(
      stops.indexOf('export const tripStops'),
      stops.indexOf('export const tripDocuments'),
    )

    expect(stopTable).not.toInclude('destination_origin')
  })

  /**
   * ⚠️ O CEP que não normaliza deixa a nota **sem parada** — e a origem continua conhecida. Gravá-la
   * só junto do `stop_id` perderia justamente a nota cuja procedência mais importa explicar.
   */
  it('persists the origin even when the address yields no stop', () => {
    expect(repository).not.toInclude('if (stopId === null) return mapTripDocument(record)')
  })
})
