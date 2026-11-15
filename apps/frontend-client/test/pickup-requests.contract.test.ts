/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  addDays,
  buildPickupRequestInput,
  canCancelPickup,
  EMPTY_ADDRESS,
  EMPTY_PICKUP_FORM,
  type PickupRequestForm,
} from '../src/modules/pickup-requests/pickupRequestForm.validation'
import { toPickupRequests } from '../src/modules/shared/portalResponse.validation'

const ADDRESS = {
  ...EMPTY_ADDRESS,
  city: 'Ribeirão Preto',
  district: 'Centro',
  number: '10',
  postalCode: '14010-000',
  state: 'sp',
  street: 'Rua A',
}
const VALID: PickupRequestForm = {
  ...EMPTY_PICKUP_FORM,
  cargoDescription: 'Caixas',
  destination: ADDRESS,
  origin: ADDRESS,
  requesterEmail: 'a@example.com',
  requesterName: 'Cliente',
  volumes: '3',
  weightKg: '12,5',
  windowEnd: '2026-11-20',
  windowStart: '2026-11-18',
}
const CONTEXT = { idempotencyKey: 'portal-key-0000000001', today: '2026-11-16' }

describe('pedido de coleta no portal (spec 339)', () => {
  test('monta o corpo: vírgula do peso vira ponto, CEP só dígitos, UF maiúscula', () => {
    const result = buildPickupRequestInput(VALID, CONTEXT)
    expect(result.errors).toBeNull()
    expect(result.input?.weightKg).toBe('12.5')
    expect(result.input?.origin.postalCode).toBe('14010000')
    expect(result.input?.origin.state).toBe('SP')
    expect(result.input?.requesterPhone).toBeNull()
  })

  test('os dados extras são opcionais, normalizados e validados', () => {
    const bare = buildPickupRequestInput(VALID, CONTEXT)
    expect(bare.input?.cargoValue).toBeNull()
    expect(bare.input?.originContactPhone).toBeNull()
    const full = buildPickupRequestInput(
      {
        ...VALID,
        accessNotes: 'Doca 2, só até 16h',
        cargoValue: '1.500,50',
        destinationContactName: 'Maria',
        destinationContactPhone: '(16) 99999-0000',
        originContactName: 'João',
        originContactPhone: '16 3333-0000',
      },
      CONTEXT,
    )
    expect(full.input?.cargoValue).toBe('1500.50')
    expect(full.input?.destinationContactPhone).toBe('16999990000')
    expect(full.input?.originContactName).toBe('João')
    const bad = buildPickupRequestInput(
      { ...VALID, cargoValue: 'abc', originContactPhone: '123' },
      CONTEXT,
    )
    expect(bad.errors?.cargoValue).toBeDefined()
    expect(bad.errors?.originContactPhone).toBeDefined()
  })

  test('recusa janela no passado, depois dos 180 dias e sem contato de retorno', () => {
    const past = buildPickupRequestInput({ ...VALID, windowStart: '2026-11-10' }, CONTEXT)
    expect(past.errors?.windowStart).toBeDefined()
    const far = buildPickupRequestInput(
      { ...VALID, windowEnd: addDays('2026-11-16', 181) },
      CONTEXT,
    )
    expect(far.errors?.windowEnd).toBeDefined()
    const noContact = buildPickupRequestInput({ ...VALID, requesterEmail: '' }, CONTEXT)
    expect(noContact.errors?.requesterEmail).toBeDefined()
  })

  test('só o pedido aguardando resposta pode ser cancelado', () => {
    expect(canCancelPickup('requested')).toBe(true)
    expect(canCancelPickup('accepted')).toBe(false)
  })

  test('a resposta descarta linha sem id ou com estado desconhecido', () => {
    const good = {
      destination: {},
      id: 'x',
      kind: 'pickup',
      origin: {},
      status: 'requested',
      volumes: 1,
    }
    const parsed = toPickupRequests({
      data: [good, { ...good, id: '' }, { ...good, status: '??' }],
    })
    expect(parsed).toHaveLength(1)
  })
})
