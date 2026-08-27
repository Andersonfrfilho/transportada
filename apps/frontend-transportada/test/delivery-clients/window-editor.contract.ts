/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { toDeliveryClientDetail } from '@/modules/delivery-clients/shared/deliveryClientsResponse.validation'
import {
  addWindow,
  changeWindow,
  findInvalidWindow,
  removeWindow,
  toTimeInputValue,
  windowsOfWeekday,
} from '@/modules/delivery-clients/shared/deliveryWindow.service'

const MORNING = { closesAt: '11:00:00', opensAt: '08:00:00', weekday: 4 }
const AFTERNOON = { closesAt: '16:00:00', opensAt: '14:00:00', weekday: 4 }

describe('o editor de janela (spec 060 T014)', () => {
  /** O almoço fechado é o buraco entre dois intervalos — e é por isso que a janela é lista. */
  it('mostra os horários do dia em ordem', () => {
    expect(windowsOfWeekday([AFTERNOON, MORNING], 4)).toEqual([MORNING, AFTERNOON])
    expect(windowsOfWeekday([MORNING], 3)).toEqual([])
  })

  it('acrescenta e remove horário sem tocar nos outros dias', () => {
    const withNew = addWindow([MORNING], 2)

    expect(withNew).toHaveLength(2)
    expect(windowsOfWeekday(withNew, 2)).toHaveLength(1)
    expect(removeWindow(withNew, MORNING)).toEqual(windowsOfWeekday(withNew, 2))
  })

  it('edita a hora do horário escolhido, e só dele', () => {
    const changed = changeWindow([MORNING, AFTERNOON], {
      field: 'closesAt',
      target: MORNING,
      value: '12:00',
    })

    expect(changed[0]?.closesAt).toBe('12:00')
    expect(changed[1]).toEqual(AFTERNOON)
  })

  /** A janela invertida morre no campo, não num 500 com nome de constraint. */
  it('acha a janela que fecha antes de abrir', () => {
    expect(findInvalidWindow([MORNING])).toBeUndefined()
    expect(findInvalidWindow([{ closesAt: '08:00', opensAt: '11:00', weekday: 4 }])).toBeDefined()
    /** Igual também é inválido: uma janela de duração zero não recebe ninguém. */
    expect(findInvalidWindow([{ closesAt: '08:00', opensAt: '08:00', weekday: 4 }])).toBeDefined()
  })

  /** Semana vazia é válida: é o cliente que não tem regra de hora, que é a maioria. */
  it('semana vazia não é erro', () => {
    expect(findInvalidWindow([])).toBeUndefined()
  })

  /** `08:00:00` do banco e `08:00` do campo são o mesmo horário. */
  it('mostra a hora sem os segundos', () => {
    expect(toTimeInputValue('08:00:00')).toBe('08:00')
    expect(toTimeInputValue('08:00')).toBe('08:00')
  })
})

describe('a ficha do cliente vinda da API', () => {
  function buildPayload(overrides: Record<string, unknown> = {}): unknown {
    return {
      data: {
        defaultServiceTimeMinutes: 20,
        deliveryFeeAmount: '45.0000',
        displayName: 'Loja Central',
        exceptions: [],
        id: '00000000-0000-4000-8000-000000000001',
        notes: '',
        requiresScheduling: true,
        status: 'active',
        taxId: '12345678000190',
        windows: [MORNING],
        ...overrides,
      },
    }
  }

  /** Ausência de regra é `null`, e a tela precisa distinguir isso de zero. */
  it('lê taxa e tempo ausentes como ausência, nunca como zero', () => {
    const detail = toDeliveryClientDetail(
      buildPayload({ defaultServiceTimeMinutes: null, deliveryFeeAmount: null }),
    )

    expect(detail.deliveryFeeAmount).toBeNull()
    expect(detail.defaultServiceTimeMinutes).toBeNull()
  })

  it('recusa ficha sem o que a tela precisa para funcionar', () => {
    expect(() => toDeliveryClientDetail(buildPayload({ requiresScheduling: 'sim' }))).toThrow()
    expect(() => toDeliveryClientDetail(buildPayload({ windows: undefined }))).toThrow()
  })
})
