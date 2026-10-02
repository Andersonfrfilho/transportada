/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  filterStopsBySearchTerm,
  matchesStopSearchTerm,
} from '@/modules/driver-trip/shared/driverTripView.service'

import { buildDriverTripDocument, buildDriverTripStop } from '../fixtures/driverTrip.fixture'

describe('a busca da viagem acha a parada', () => {
  it('termo vazio não filtra — toda parada passa', () => {
    expect(matchesStopSearchTerm(buildDriverTripStop(), '')).toBe(true)
    expect(matchesStopSearchTerm(buildDriverTripStop(), '   ')).toBe(true)
  })

  it('pelo número da nota', () => {
    expect(matchesStopSearchTerm(buildDriverTripStop(), '900123')).toBe(true)
    expect(matchesStopSearchTerm(buildDriverTripStop(), '900999')).toBe(false)
  })

  it('pelo destinatário, sem depender de caixa nem de acento', () => {
    const stop = buildDriverTripStop({
      documents: [buildDriverTripDocument({ recipientName: 'Padaria São José' })],
    })
    expect(matchesStopSearchTerm(stop, 'sao jose')).toBe(true)
    expect(matchesStopSearchTerm(stop, 'PADARIA')).toBe(true)
  })

  /** É o que o leitor de QR code entrega: a chave inteira, 44 dígitos, sem separador. */
  it('pela chave de acesso lida da etiqueta', () => {
    const accessKey = '35260712345678000195550010009001231000000017'
    expect(matchesStopSearchTerm(buildDriverTripStop(), accessKey)).toBe(true)
  })

  it('pelo endereço da parada', () => {
    const stop = buildDriverTripStop({ label: 'Rua da Saudade, 110, Santo Antonio do Jardim, SP' })
    expect(matchesStopSearchTerm(stop, 'santo antonio')).toBe(true)
    expect(matchesStopSearchTerm(stop, 'avenida que não existe')).toBe(false)
  })

  it('parada sem nota alguma ainda é achada pelo endereço', () => {
    const stop = buildDriverTripStop({ documents: [], label: 'Rua da Saudade, 110' })
    expect(matchesStopSearchTerm(stop, 'saudade')).toBe(true)
    expect(matchesStopSearchTerm(stop, '900123')).toBe(false)
  })

  it('filterStopsBySearchTerm devolve só quem bate, na ordem da viagem', () => {
    const first = buildDriverTripStop({ id: 'stop-1', sequence: 1 })
    const second = buildDriverTripStop({
      documents: [
        buildDriverTripDocument({
          accessKey: '35260799999999000199550010009009991000000017',
          number: '900999',
          recipientName: 'Outro Cliente',
        }),
      ],
      id: 'stop-2',
      label: 'Avenida Distante, 200',
      sequence: 2,
    })

    expect(filterStopsBySearchTerm([first, second], '900123')).toEqual([first])
    expect(filterStopsBySearchTerm([first, second], '')).toEqual([first, second])
    expect(filterStopsBySearchTerm([first, second], 'nada aqui bate')).toEqual([])
  })
})
