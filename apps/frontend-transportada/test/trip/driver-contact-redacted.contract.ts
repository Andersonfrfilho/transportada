/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import { TRIP_DETAIL } from './trip.fixture'

const adapters = createTripResponseAdapters()

function aceita(data: unknown): boolean {
  try {
    adapters.tripDetailFromApi(data)
    return true
  } catch {
    return false
  }
}

/**
 * Spec 156 D11: quem lê a viagem sem `fleet.read` (o `finance`) recebe o motorista pelo nome, com
 * CPF, e-mail e telefone `null`. O detalhe continua válido — nulo é recorte, não contrato quebrado.
 */
describe('motorista recortado sem fleet.read (spec 156 D11)', () => {
  const recortado = {
    ...TRIP_DETAIL,
    drivers: TRIP_DETAIL.drivers.map((driver) => ({
      ...driver,
      driverEmail: null,
      driverPhone: null,
      driverTaxId: null,
    })),
  }

  it('aceita CPF, e-mail e telefone nulos', () => {
    expect(aceita(recortado)).toBe(true)
  })

  it('continua recusando CPF com tipo errado', () => {
    const errado = {
      ...TRIP_DETAIL,
      drivers: TRIP_DETAIL.drivers.map((driver) => ({ ...driver, driverTaxId: 123 })),
    }
    expect(aceita(errado)).toBe(false)
  })

  it('o nome do motorista continua obrigatório', () => {
    const semNome = {
      ...TRIP_DETAIL,
      drivers: TRIP_DETAIL.drivers.map((driver) => ({ ...driver, driverName: null })),
    }
    expect(aceita(semNome)).toBe(false)
  })
})
