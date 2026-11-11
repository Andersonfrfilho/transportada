/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { DriverTrip, DriverTripStop } from '@/modules/driver-trip/shared/driverTrip.types'
import { listTripSelectorCities } from '@/modules/driver-trip/shared/driverTripSelection.service'
import { formatTripCreatedDate } from '@/modules/driver-trip/shared/tripIdentifier.service'
import {
  classifyVehiclePlate,
  formatVehiclePlateText,
} from '@/modules/driver-trip/shared/vehiclePlate.service'

function tripWithLabels(labels: readonly string[]): DriverTrip {
  return {
    createdAt: '2026-11-10T12:00:00.000Z',
    id: 'b8608455-0000-4000-8000-000000000000',
    manifest: null,
    status: 'in_transit',
    stops: labels.map((label, index) => ({
      id: `s${index}`,
      label,
      sequence: index + 1,
    })) as unknown as readonly DriverTripStop[],
    vehiclePlate: 'IUZ9D73',
  }
}

describe('placa do veículo e identificação da viagem na listagem (pedido do usuário 10/11)', () => {
  it('Mercosul é AAA1A23; a antiga é AAA1234; o resto é desconhecido', () => {
    expect(classifyVehiclePlate('IUZ9D73')).toBe('mercosul')
    expect(classifyVehiclePlate('abc-1234')).toBe('legacy')
    expect(classifyVehiclePlate('ABC 1D23')).toBe('mercosul')
    expect(classifyVehiclePlate('PLACA-1')).toBe('unknown')
    expect(classifyVehiclePlate('')).toBe('unknown')
  })

  it('a antiga leva hífen no texto; a Mercosul não', () => {
    expect(formatVehiclePlateText('abc1234')).toBe('ABC-1234')
    expect(formatVehiclePlateText('iuz9d73')).toBe('IUZ9D73')
  })

  it('as cidades saem do fim do rótulo, na ordem, sem repetir', () => {
    const trip = tripWithLabels([
      'R SARAH MIGUEL FELIX, 1500, ALTINOPOLIS, SP',
      'Rua Um, 10, ORLANDIA, SP — portaria',
      'Rua Dois, 20, ORLANDIA, SP',
    ])
    expect(listTripSelectorCities(trip)).toEqual(['ALTINOPOLIS', 'ORLANDIA'])
  })

  it('rótulo fora do formato não contribui, e sem parada a lista é vazia', () => {
    expect(listTripSelectorCities(tripWithLabels(['Praca da Se, 100']))).toEqual([])
    expect(listTripSelectorCities(tripWithLabels([]))).toEqual([])
  })

  it('a data é só o dia, e data inválida some', () => {
    expect(formatTripCreatedDate('2026-11-10T15:00:00.000Z')).toBe('10/11/2026')
    expect(formatTripCreatedDate('lixo')).toBe('')
  })
})
