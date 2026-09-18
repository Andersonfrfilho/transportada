/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  hasMultipleDrivers,
  resolveDefaultOnBehalfDriverId,
  resolveFieldActionCapabilities,
} from '../../src/modules/trip/shared/tripFieldActions.service'
import type { TripAllowedActions } from '../../src/modules/trip/shared/tripAllowedActions.validation'

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000d01'
const STOP_ID = '00000000-0000-4000-8000-000000000b01'

/**
 * Spec 156 T8: sem a lista (hook com resposta ausente/malformada — a consulta ainda não voltou, a
 * API é antiga na janela de deploy, ou `parseTripAllowedActions` recusou o corpo), nenhuma ação de
 * campo aparece. Falha **fechada**.
 */
describe('resolveFieldActionCapabilities (spec 156 T8)', () => {
  it('sem resposta, nenhuma ação de campo aparece', () => {
    const capabilities = resolveFieldActionCapabilities(undefined)

    expect(capabilities.canTrip('startRoute')).toBe(false)
    expect(capabilities.canStop(STOP_ID, 'arrive')).toBe(false)
    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldDelivery')).toBe(false)
  })

  it('lê a ação da viagem, da parada e da nota quando a lista responde', () => {
    const actions: TripAllowedActions = {
      documents: { [DOCUMENT_ID]: ['fieldDelivery', 'fieldReturn'] },
      stops: { [STOP_ID]: ['arrive', 'occurrence'] },
      trip: ['confirmLoad', 'startRoute'],
    }
    const capabilities = resolveFieldActionCapabilities(actions)

    expect(capabilities.canTrip('startRoute')).toBe(true)
    expect(capabilities.canTrip('cancel')).toBe(false)
    expect(capabilities.canStop(STOP_ID, 'arrive')).toBe(true)
    expect(capabilities.canStop('outra-parada', 'arrive')).toBe(false)
    /**
     * Aceite 4 (D10): em `on_delivery_route`, uma nota `loaded` recebe `fieldDelivery`/
     * `fieldReturn` — a T11 é quem oferece o assistente, mas a capacidade já precisa surgir aqui.
     */
    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldDelivery')).toBe(true)
    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldReturn')).toBe(true)
    expect(capabilities.canDocument(DOCUMENT_ID, 'fieldOccurrence')).toBe(false)
  })
})

describe('resolveDefaultOnBehalfDriverId / hasMultipleDrivers (spec 156 D3)', () => {
  it('escolhe o motorista de position 1 por padrão', () => {
    const drivers = [
      { driverId: 'driver-2', position: 2 },
      { driverId: 'driver-1', position: 1 },
    ]

    expect(resolveDefaultOnBehalfDriverId(drivers)).toBe('driver-1')
  })

  it('sem motorista de position 1, não escolhe nenhum', () => {
    expect(resolveDefaultOnBehalfDriverId([{ driverId: 'driver-2', position: 2 }])).toBeUndefined()
    expect(resolveDefaultOnBehalfDriverId([])).toBeUndefined()
  })

  it('o seletor só aparece com mais de um motorista', () => {
    expect(hasMultipleDrivers([])).toBe(false)
    expect(hasMultipleDrivers([{ driverId: 'driver-1' }])).toBe(false)
    expect(hasMultipleDrivers([{ driverId: 'driver-1' }, { driverId: 'driver-2' }])).toBe(true)
  })
})
