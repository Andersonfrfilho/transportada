/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

import enLocale from '../../src/modules/fleet/locales/fleet.en.locale.json'
import ptBrLocale from '../../src/modules/fleet/locales/fleet.locale.json'
import type { FleetDriverDetail } from '../../src/modules/fleet/shared/fleet.types'
import {
  createDriverDraft,
  toDriverBody,
  toDriverFormState,
} from '../../src/modules/fleet/shared/fleetForm.service'
import { DRIVER_DETAIL } from './fleet.fixture'

const LINKED_ADDRESS_LABEL_KEYS = ['driverLinkedAddressHint', 'driverLinkedAddressLegend'] as const

const LINKED_ADDRESS = {
  city: 'Ribeirão Preto',
  complement: 'Sala 3',
  district: 'Centro',
  number: '250',
  postalCode: '14010100',
  state: 'SP',
  street: 'Rua São Sebastião',
} as const

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('driver linked address contract', () => {
  test('opens the linked company address blank on a new driver', () => {
    const draft = createDriverDraft()

    expect(draft.linkedAddressCity).toBe('')
    expect(draft.linkedAddressComplement).toBe('')
    expect(draft.linkedAddressDistrict).toBe('')
    expect(draft.linkedAddressNumber).toBe('')
    expect(draft.linkedAddressPostalCode).toBe('')
    expect(draft.linkedAddressState).toBe('')
    expect(draft.linkedAddressStreet).toBe('')
  })

  test('reads the linked company address back and sends it canonical', () => {
    const driver = { ...DRIVER_DETAIL, linkedAddress: LINKED_ADDRESS } as FleetDriverDetail
    const state = toDriverFormState(driver)

    expect(state.linkedAddressCity).toBe(LINKED_ADDRESS.city)
    expect(state.linkedAddressStreet).toBe(LINKED_ADDRESS.street)

    const body = toDriverBody({
      ...state,
      linkedAddressPostalCode: '14010-100',
      linkedAddressState: 'sp',
    })

    expect(body.linkedAddress.postalCode).toBe('14010100')
    expect(body.linkedAddress.state).toBe('SP')
    expect(body.linkedAddress.number).toBe(LINKED_ADDRESS.number)
  })

  test('names the linked company address in both locales', () => {
    for (const key of LINKED_ADDRESS_LABEL_KEYS) {
      expect(ptBrLocale[key]).toBeTruthy()
      expect(enLocale[key]).toBeTruthy()
    }
  })

  test('keeps the linked address out of the textual address search', () => {
    const source = readSource(
      'src/modules/fleet/components/DriverLinkedAddressFields.component.tsx',
    )

    expect(source).toContain('driverLinkedAddressLegend')
    expect(source).not.toContain('driverAddressSearch')
  })
})
