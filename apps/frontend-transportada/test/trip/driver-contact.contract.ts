/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'
import { TRIP_DETAIL } from './trip.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const adapters = createTripResponseAdapters()

function aceita(payload: unknown): boolean {
  try {
    adapters.tripDetailFromApi(payload)
    return true
  } catch {
    return false
  }
}

/**
 * Quem opera precisa falar com quem dirige, e a tela mostrava só o nome — o telefone exigia abrir a
 * frota noutra aba. O contato é **corrente**, da ficha da frota; nome e CPF continuam sendo o
 * retrato de quando a viagem foi montada.
 */
describe('o contato do motorista na tela da viagem', () => {
  test('aceita o motorista com contato', () => {
    expect(
      aceita({
        ...TRIP_DETAIL,
        drivers: [
          {
            ...TRIP_DETAIL.drivers[0],
            driverEmail: 'ana@empresa.test',
            driverPhone: '16999990001',
          },
        ],
      }),
    ).toBe(true)
  })

  /** Spec 078 D2: campo novo nasce opcional — API anterior serve o motorista sem ele. */
  test('aceita o motorista sem contato, como uma API anterior o serviria', () => {
    const anterior: Record<string, unknown> = { ...TRIP_DETAIL.drivers[0] }
    Reflect.deleteProperty(anterior, 'driverEmail')
    Reflect.deleteProperty(anterior, 'driverPhone')

    expect(aceita({ ...TRIP_DETAIL, drivers: [anterior] })).toBe(true)
  })

  /** Opcional não é "qualquer coisa": presente com forma errada continua reprovando. */
  test('reprova contato com forma errada', () => {
    expect(
      aceita({ ...TRIP_DETAIL, drivers: [{ ...TRIP_DETAIL.drivers[0], driverPhone: 55 }] }),
    ).toBe(false)
  })

  /**
   * O contato é **link**, não texto: quem está no galpão toca e liga, em vez de copiar o número à
   * mão. E some quando a ficha não tem — link vazio é pior que ausência.
   */
  test('a tela oferece ligar e escrever, e esconde o que não existe', async () => {
    const detalhe = await Bun.file(
      new URL('src/modules/trip/components/TripDetail.component.tsx', APPLICATION_ROOT),
    ).text()

    expect(detalhe).toContain('`tel:${driver.driverPhone}`')
    expect(detalhe).toContain('`mailto:${driver.driverEmail}`')
    expect(detalhe).toContain("driver.driverPhone === '' ? null")
    expect(detalhe).toContain("driver.driverEmail === '' ? null")
  })
})
