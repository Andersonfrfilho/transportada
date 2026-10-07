/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9): a validação do formulário da chegada, com as mesmas faixas do servidor
 * (`cargo-arrival.schema.ts`): contratante e hora obrigatórios, a chegada não passa de 2 minutos no
 * futuro, paletes inteiro de 0 ao teto da coluna, referência de 1 a 120, de 1 a 300 notas.
 */
import { describe, expect, test } from 'bun:test'

import {
  createArrivalDraft,
  toRegisterArrivalInput,
  validateArrivalDraft,
  type ArrivalDraft,
} from '@/modules/cargo-receiving/shared/cargoArrivalForm.validation'
import {
  maskTypedTime,
  resolveArrivalMoment,
} from '@/modules/cargo-receiving/shared/cargoArrivalTime.service'

const NOW = new Date(2026, 9, 3, 15, 30, 0)
const CONTRACTOR = '00000000-0000-4000-8000-000000237a01'

function draft(overrides: Partial<ArrivalDraft> = {}): ArrivalDraft {
  return { ...createArrivalDraft(NOW), contractorId: CONTRACTOR, ...overrides }
}

describe('o rascunho da chegada (spec 237 T2.4)', () => {
  test('nasce com a data e a hora de agora, no fuso do navegador', () => {
    expect(createArrivalDraft(NOW)).toEqual({
      contractorId: '',
      date: '2026-10-03',
      palletCount: '',
      reference: '',
      time: '15:30',
    })
  })

  test('um rascunho preenchido e uma nota não tem problema algum', () => {
    expect(validateArrivalDraft({ documentCount: 1, draft: draft(), now: NOW })).toEqual({})
  })
})

describe('a validação com as faixas do servidor', () => {
  function issues(overrides: Partial<ArrivalDraft>, documentCount = 1) {
    return validateArrivalDraft({ documentCount, draft: draft(overrides), now: NOW })
  }

  test('o contratante é obrigatório', () => {
    expect(issues({ contractorId: '' }).contractorId).toEqual({ code: 'required' })
  })

  test('a data é obrigatória e a hora tem de ser HH:MM válida', () => {
    expect(issues({ date: '' }).arrivedAt).toEqual({ code: 'required' })
    expect(issues({ time: '' }).arrivedAt).toEqual({ code: 'required' })
    expect(issues({ time: '25:00' }).arrivedAt).toEqual({ code: 'invalidTime' })
    expect(issues({ time: '12:60' }).arrivedAt).toEqual({ code: 'invalidTime' })
    expect(issues({ time: '9:5' }).arrivedAt).toEqual({ code: 'invalidTime' })
  })

  test('até 2 minutos no futuro passa, a partir daí não', () => {
    expect(issues({ time: '15:32' }).arrivedAt).toBeUndefined()
    expect(issues({ time: '15:33' }).arrivedAt).toEqual({ code: 'future' })
    expect(issues({ date: '2026-10-04', time: '00:00' }).arrivedAt).toEqual({ code: 'future' })
  })

  test('até 30 dias para trás passa, a partir daí não: o mesmo piso do servidor (L6)', () => {
    expect(issues({ date: '2026-09-03', time: '15:30' }).arrivedAt).toBeUndefined()
    expect(issues({ date: '2026-09-03', time: '15:29' }).arrivedAt).toEqual({
      code: 'tooOld',
      max: 30,
    })
    expect(issues({ date: '2026-01-01', time: '08:00' }).arrivedAt).toEqual({
      code: 'tooOld',
      max: 30,
    })
  })

  test('paletes é opcional, inteiro e de 0 a 2147483647', () => {
    expect(issues({ palletCount: '' }).palletCount).toBeUndefined()
    expect(issues({ palletCount: '0' }).palletCount).toBeUndefined()
    expect(issues({ palletCount: '2147483647' }).palletCount).toBeUndefined()
    expect(issues({ palletCount: '2147483648' }).palletCount).toEqual({
      code: 'integer',
      max: 2147483647,
      min: 0,
    })
    expect(issues({ palletCount: '-1' }).palletCount?.code).toBe('integer')
    expect(issues({ palletCount: '1,5' }).palletCount?.code).toBe('integer')
    expect(issues({ palletCount: 'doze' }).palletCount?.code).toBe('integer')
  })

  test('a referência é opcional, e com texto vai de 1 a 120 depois de aparada', () => {
    expect(issues({ reference: '   ' }).reference).toBeUndefined()
    expect(issues({ reference: 'x'.repeat(120) }).reference).toBeUndefined()
    expect(issues({ reference: 'x'.repeat(121) }).reference).toEqual({ code: 'tooLong', max: 120 })
    expect(issues({ reference: ` ${'x'.repeat(120)} ` }).reference).toBeUndefined()
  })

  test('é preciso ao menos uma nota e no máximo 300', () => {
    expect(issues({}, 0).documents).toEqual({ code: 'noDocuments' })
    expect(issues({}, 300).documents).toBeUndefined()
    expect(issues({}, 301).documents).toEqual({ code: 'tooMany', max: 300 })
  })

  test('devolve todos os problemas de uma vez, não só o primeiro', () => {
    const all = issues(
      { contractorId: '', palletCount: 'x', reference: 'x'.repeat(200), time: '' },
      0,
    )

    expect(Object.keys(all).sort()).toEqual([
      'arrivedAt',
      'contractorId',
      'documents',
      'palletCount',
      'reference',
    ])
  })
})

describe('o corpo do pedido', () => {
  test('leva só o que a API aceita, sem empresa nem ator, com a hora em ISO', () => {
    const input = toRegisterArrivalInput({
      documentIds: ['b', 'a'],
      draft: draft({ palletCount: '12', reference: '  Lacre 4471 ' }),
    })

    expect(input).toEqual({
      arrivedAt: new Date(2026, 9, 3, 15, 30).toISOString(),
      contractorId: CONTRACTOR,
      documentIds: ['b', 'a'],
      palletCount: 12,
      reference: 'Lacre 4471',
    })
    expect(Object.keys(input)).not.toContain('companyId')
  })

  test('paletes e referência em branco ficam de fora, nunca como zero ou texto vazio', () => {
    const input = toRegisterArrivalInput({ documentIds: ['a'], draft: draft() })

    expect(Object.keys(input).sort()).toEqual(['arrivedAt', 'contractorId', 'documentIds'])
  })
})

describe('a hora digitada', () => {
  test.each([
    ['1', '1'],
    ['14', '14'],
    ['143', '14:3'],
    ['1430', '14:30'],
    ['14:30', '14:30'],
    ['14h30', '14:30'],
    ['143099', '14:30'],
    ['', ''],
  ])('mascara %s como %s', (typed, masked) => {
    expect(maskTypedTime(typed)).toBe(masked)
  })

  test('resolve data e hora locais num instante, e recusa o que não é data', () => {
    expect(resolveArrivalMoment({ date: '2026-10-03', time: '15:30' })?.getTime()).toBe(
      new Date(2026, 9, 3, 15, 30).getTime(),
    )
    expect(resolveArrivalMoment({ date: '', time: '15:30' })).toBeUndefined()
    expect(resolveArrivalMoment({ date: '2026-10-03', time: '15' })).toBeUndefined()
    expect(resolveArrivalMoment({ date: '2026-02-31', time: '10:00' })).toBeUndefined()
  })
})
