/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.4 (RF13): a correção manda o número e os valores em três estados — ausente mantém o gravado,
 * nulo limpa, texto vale — e nunca o valor da ocorrência junto do valor de linha. Dinheiro sempre texto.
 */
import { describe, expect, test } from 'bun:test'

import {
  EMPTY_CORRECTION_AMOUNTS_DRAFT,
  isValidReferenceNumber,
  resolveCorrectionAmountScope,
  resolveCorrectionAmounts,
  type CorrectionAmountsDraft,
} from '@/modules/trip/shared/occurrenceCorrectionAmounts.service'
import { readCorrectionLineSums } from '@/modules/trip/shared/occurrenceCorrectionSums.service'
import {
  buildCorrectionRecordedAmounts,
  EMPTY_CORRECTION_RECORDED_AMOUNTS,
  resolveCorrectionFinalAmounts,
} from '@/modules/trip/shared/occurrenceRecordedAmounts.service'
import { buildOccurrenceCorrectionItems } from '@/modules/trip/shared/occurrenceProductSelection.service'

function draft(overrides: Partial<CorrectionAmountsDraft>): CorrectionAmountsDraft {
  return { ...EMPTY_CORRECTION_AMOUNTS_DRAFT, ...overrides }
}

describe('o número do documento do cliente (RF14: [A-Za-z0-9 ./-], até 30)', () => {
  test('o que a API aceita', () => {
    for (const text of ['45029', 'NFD 45029', 'A.1/2-3', 'x'.repeat(30)]) {
      expect(isValidReferenceNumber(text)).toBe(true)
    }
  })

  test('o que a API recusa: vazio, 31 caracteres, símbolo, acento', () => {
    for (const text of ['', 'x'.repeat(31), 'NFD#1', 'NFD_1', 'NFD é', 'a;b']) {
      expect(isValidReferenceNumber(text)).toBe(false)
    }
  })
})

describe('três estados: ausente mantém, nulo limpa, texto vale', () => {
  test('nada editado: nada vai, e nada é erro', () => {
    const resolved = resolveCorrectionAmounts({
      codes: ['696'],
      draft: EMPTY_CORRECTION_AMOUNTS_DRAFT,
    })
    expect(resolved).toEqual({
      hasReferenceNumberError: false,
      hasRequiredCleared: false,
      lineAmounts: new Map(),
    })
    expect(resolved).not.toHaveProperty('referenceNumber')
    expect(resolved).not.toHaveProperty('declaredAmount')
  })

  test('número digitado vale aparado; apagado vira nulo; inválido é erro e não vai', () => {
    expect(
      resolveCorrectionAmounts({ codes: [], draft: draft({ referenceNumber: '  NFD 45029 ' }) })
        .referenceNumber,
    ).toBe('NFD 45029')
    const cleared = resolveCorrectionAmounts({
      codes: [],
      draft: draft({ referenceNumber: '   ' }),
    })
    expect(cleared).toHaveProperty('referenceNumber')
    expect(cleared.referenceNumber).toBeNull()
    const invalid = resolveCorrectionAmounts({
      codes: [],
      draft: draft({ referenceNumber: 'NFD#1' }),
    })
    expect(invalid.hasReferenceNumberError).toBe(true)
    expect(invalid).not.toHaveProperty('referenceNumber')
  })

  test('valor por linha: o campo mascarado vira texto decimal; vazio limpa; zero é valor', () => {
    const resolved = resolveCorrectionAmounts({
      codes: ['696', '697', '698'],
      draft: draft({
        lineAmounts: new Map([
          ['696', '1.234,50'],
          ['697', ''],
          ['698', '0,00'],
        ]),
      }),
    })
    expect(resolved.lineAmounts).toEqual(
      new Map<string, null | string>([
        ['696', '1234.50'],
        ['697', null],
        ['698', '0.00'],
      ]),
    )
    expect(resolved).not.toHaveProperty('declaredAmount')
  })

  test('valor de linha de código que saiu da seleção não vai', () => {
    const resolved = resolveCorrectionAmounts({
      codes: ['696'],
      draft: draft({ lineAmounts: new Map([['999', '10,00']]) }),
    })
    expect(resolved.lineAmounts.size).toBe(0)
  })

  test('valor da ocorrência: texto vale, vazio limpa, e some quando o escopo é por linha', () => {
    const occurrence = draft({ occurrenceAmount: '199,99', scope: 'occurrence' })
    expect(resolveCorrectionAmounts({ codes: ['696'], draft: occurrence }).declaredAmount).toBe(
      '199.99',
    )
    const cleared = resolveCorrectionAmounts({
      codes: [],
      draft: draft({ occurrenceAmount: '', scope: 'occurrence' }),
    })
    expect(cleared).toHaveProperty('declaredAmount')
    expect(cleared.declaredAmount).toBeNull()

    const byLine = resolveCorrectionAmounts({
      codes: ['696'],
      draft: draft({ occurrenceAmount: '199,99', scope: 'item' }),
    })
    expect(byLine).not.toHaveProperty('declaredAmount')
  })

  test('valor de linha digitado some quando o escopo é a ocorrência (nunca os dois níveis: 400)', () => {
    const resolved = resolveCorrectionAmounts({
      codes: ['696'],
      draft: draft({ lineAmounts: new Map([['696', '10,00']]), scope: 'occurrence' }),
    })
    expect(resolved.lineAmounts.size).toBe(0)
  })
})

describe('o corpo da correção leva o valor só nas linhas editadas', () => {
  test('sem valor editado o corpo é o de sempre', () => {
    expect(buildOccurrenceCorrectionItems({ codes: ['696'], quantitiesByCode: new Map() })).toEqual(
      [{ code: '696' }],
    )
  })

  test('declaredAmount entra na linha: texto, nulo, ausente', () => {
    const items = buildOccurrenceCorrectionItems({
      codes: ['696', '697', '698'],
      declaredAmounts: new Map<string, null | string>([
        ['696', '50.00'],
        ['697', null],
      ]),
      quantitiesByCode: new Map([['696', { quantity: '1', unit: 'CX' }]]),
    })
    expect(items).toEqual([
      { code: '696', declaredAmount: '50.00', quantity: '1', unit: 'CX' },
      { code: '697', declaredAmount: null },
      { code: '698' },
    ])
    expect(items[2]).not.toHaveProperty('declaredAmount')
  })
})

describe('o gravado vira o estado inicial (spec 247 T7.2, A1/A2)', () => {
  const onLines = buildCorrectionRecordedAmounts({
    itemValues: [
      { declaredAmount: '50.00', productCode: '696', quantity: '2.000', unitValue: '19.9950' },
      { declaredAmount: null, productCode: '697', quantity: '1.000', unitValue: '57.2000' },
    ],
  })
  const onOccurrence = buildCorrectionRecordedAmounts({ declaredAmount: '40.00' })

  test('só a linha com valor pago entra no gravado; ausente é "nada gravado"', () => {
    expect([...onLines.lineAmounts]).toEqual([['696', '50.00']])
    expect(onLines.declaredAmount).toBeNull()
    expect(buildCorrectionRecordedAmounts({})).toEqual(EMPTY_CORRECTION_RECORDED_AMOUNTS)
    expect(buildCorrectionRecordedAmounts({ declaredAmount: '0.00' }).declaredAmount).toBe('0.00')
  })

  test('o nível nasce onde está gravado; sem gravado, no do tipo; sem tipo, por linha', () => {
    const codes = ['696', '697']
    expect(resolveCorrectionAmountScope({ codes, draft: draft({}), recorded: onLines })).toBe(
      'item',
    )
    expect(
      resolveCorrectionAmountScope({
        codes,
        draft: draft({}),
        recorded: onOccurrence,
        typeScope: 'item',
      }),
    ).toBe('occurrence')
    const empty = EMPTY_CORRECTION_RECORDED_AMOUNTS
    expect(resolveCorrectionAmountScope({ codes, draft: draft({}), typeScope: 'occurrence' })).toBe(
      'occurrence',
    )
    expect(resolveCorrectionAmountScope({ codes, draft: draft({}), recorded: empty })).toBe('item')
    expect(
      resolveCorrectionAmountScope({
        codes,
        draft: draft({ scope: 'item' }),
        recorded: onOccurrence,
      }),
    ).toBe('item')
  })

  test('(a) gravado na linha, vira "um só" e digita 40,00: ocorrência 40.00 e todas as linhas nulas', () => {
    const resolved = resolveCorrectionAmounts({
      codes: ['696', '697'],
      draft: draft({ occurrenceAmount: '40,00', scope: 'occurrence' }),
      recorded: onLines,
    })
    expect(resolved.declaredAmount).toBe('40.00')
    expect(resolved.lineAmounts).toEqual(
      new Map<string, null | string>([
        ['696', null],
        ['697', null],
      ]),
    )
  })

  test('(b) gravado na ocorrência, vira "por linha" e digita numa linha: ocorrência nula e o valor da linha', () => {
    const resolved = resolveCorrectionAmounts({
      codes: ['696', '697'],
      draft: draft({ lineAmounts: new Map([['696', '50,00']]), scope: 'item' }),
      recorded: onOccurrence,
    })
    expect(resolved).toHaveProperty('declaredAmount')
    expect(resolved.declaredAmount).toBeNull()
    expect(resolved.lineAmounts).toEqual(new Map([['696', '50.00']]))
  })

  test('trocar de nível sem valor novo não apaga o gravado; zero é valor e apaga o outro nível', () => {
    const untouched = resolveCorrectionAmounts({
      codes: ['696'],
      draft: draft({ scope: 'occurrence' }),
      recorded: onLines,
    })
    expect(untouched).not.toHaveProperty('declaredAmount')
    expect(untouched.lineAmounts.size).toBe(0)

    const zero = resolveCorrectionAmounts({
      codes: ['696'],
      draft: draft({ occurrenceAmount: '0,00', scope: 'occurrence' }),
      recorded: onLines,
    })
    expect(zero.declaredAmount).toBe('0.00')
    expect(zero.lineAmounts.get('696')).toBeNull()
  })

  test('(c) limpar: a linha nula não apaga a ocorrência, e a ocorrência nula não toca as linhas', () => {
    const line = resolveCorrectionAmounts({
      codes: ['696'],
      draft: draft({ lineAmounts: new Map([['696', '']]), scope: 'item' }),
      recorded: onLines,
    })
    expect(line.lineAmounts.get('696')).toBeNull()
    expect(line).not.toHaveProperty('declaredAmount')

    const occurrence = resolveCorrectionAmounts({
      codes: ['696'],
      draft: draft({ occurrenceAmount: '', scope: 'occurrence' }),
      recorded: onOccurrence,
    })
    expect(occurrence.declaredAmount).toBeNull()
    expect(occurrence.lineAmounts.size).toBe(0)
  })

  test('nunca os dois níveis com valor no mesmo corpo, em nenhuma combinação', () => {
    for (const recorded of [onLines, onOccurrence, EMPTY_CORRECTION_RECORDED_AMOUNTS]) {
      for (const scope of ['item', 'occurrence'] as const) {
        const resolved = resolveCorrectionAmounts({
          codes: ['696', '697'],
          draft: draft({
            lineAmounts: new Map([['696', '1,00']]),
            occurrenceAmount: '2,00',
            scope,
          }),
          recorded,
        })
        const hasLine = [...resolved.lineAmounts.values()].some((amount) => amount !== null)
        const hasOccurrence =
          resolved.declaredAmount !== undefined && resolved.declaredAmount !== null
        expect(hasLine && hasOccurrence).toBe(false)
      }
    }
  })
})

describe('o valor que vai no e-mail (RF9 espelhada)', () => {
  const products = [
    {
      code: '696',
      commercialUnit: 'CX',
      description: 'A',
      ordinal: 1,
      quantity: '9.000',
      totalValue: '9.00',
      unitValue: '1.0000',
    },
    {
      code: '697',
      commercialUnit: 'CX',
      description: 'B',
      ordinal: 2,
      quantity: '1.000',
      totalValue: '57.20',
      unitValue: '57.2000',
    },
  ]
  const quantities = new Map([
    ['696', { quantity: '3', unit: 'CX' }],
    ['697', { quantity: '', unit: 'CX' }],
  ])

  function emailAmount(input: Parameters<typeof resolveCorrectionFinalAmounts>[0]): null | string {
    return readCorrectionLineSums({
      codes: input.codes,
      final: resolveCorrectionFinalAmounts(input),
      products,
      quantitiesByCode: quantities,
    }).emailAmount
  }

  const codes = ['696', '697']

  test('sem valor pago, é a soma geral; o pago da linha vale no lugar da soma da linha', () => {
    const none = emailAmount({
      codes,
      recorded: EMPTY_CORRECTION_RECORDED_AMOUNTS,
      resolution: resolveCorrectionAmounts({ codes, draft: draft({}) }),
    })
    expect(none).toBe('60,20')
    const paid = buildCorrectionRecordedAmounts({
      itemValues: [
        { declaredAmount: '10.00', productCode: '696', quantity: '3.000', unitValue: '1.0000' },
      ],
    })
    expect(
      emailAmount({
        codes,
        recorded: paid,
        resolution: resolveCorrectionAmounts({ codes, draft: draft({}), recorded: paid }),
      }),
    ).toBe('67,20')
  })

  test('o valor pago da ocorrência vale como está, e o zero também', () => {
    for (const [typed, expected] of [
      ['199,99', '199,99'],
      ['0,00', '0,00'],
    ] as const) {
      const resolution = resolveCorrectionAmounts({
        codes,
        draft: draft({ occurrenceAmount: typed, scope: 'occurrence' }),
      })
      expect(emailAmount({ codes, recorded: EMPTY_CORRECTION_RECORDED_AMOUNTS, resolution })).toBe(
        expected,
      )
    }
  })

  test('3 × 19,995 fecha em 59,99 (meio para cima), sem float', () => {
    const result = readCorrectionLineSums({
      codes: ['X'],
      final: { lineAmounts: new Map(), occurrenceAmount: null },
      products: [
        {
          code: 'X',
          commercialUnit: 'UN',
          description: 'X',
          ordinal: 1,
          quantity: '3.000',
          totalValue: '60.00',
          unitValue: '19.9950',
        },
      ],
      quantitiesByCode: new Map([['X', { quantity: '3', unit: 'UN' }]]),
    })
    expect(result.emailAmount).toBe('59,99')
  })
})

describe('o modo efetivo do tipo manda na correção (spec 247 T7.2b, N1)', () => {
  const typed = draft({
    lineAmounts: new Map([['696', '5,00']]),
    occurrenceAmount: '9,00',
    referenceNumber: 'NFD 45029',
  })

  test('off: nada do número nem do valor pago vai no corpo, mesmo digitado antes', () => {
    const resolved = resolveCorrectionAmounts({
      amountMode: 'off',
      codes: ['696'],
      draft: typed,
      referenceMode: 'off',
    })
    expect(resolved).not.toHaveProperty('referenceNumber')
    expect(resolved).not.toHaveProperty('declaredAmount')
    expect(resolved.lineAmounts.size).toBe(0)
    expect(resolved.hasReferenceNumberError).toBe(false)
  })

  test('off só no número: o valor pago segue, e número inválido digitado antes não reprova', () => {
    const resolved = resolveCorrectionAmounts({
      amountMode: 'optional',
      codes: ['696'],
      draft: draft({ lineAmounts: typed.lineAmounts, referenceNumber: 'NFD#1' }),
      referenceMode: 'off',
    })
    expect(resolved.hasReferenceNumberError).toBe(false)
    expect(resolved.lineAmounts.get('696')).toBe('5.00')
  })

  test('required: esvaziar o número ou o valor pago bloqueia; digitar não', () => {
    const base = { amountMode: 'required', referenceMode: 'required' } as const
    expect(
      resolveCorrectionAmounts({ ...base, codes: [], draft: draft({ referenceNumber: '  ' }) })
        .hasRequiredCleared,
    ).toBe(true)
    expect(
      resolveCorrectionAmounts({
        ...base,
        codes: ['696'],
        draft: draft({ lineAmounts: new Map([['696', '']]) }),
      }).hasRequiredCleared,
    ).toBe(true)
    expect(
      resolveCorrectionAmounts({
        ...base,
        codes: [],
        draft: draft({ occurrenceAmount: '', scope: 'occurrence' }),
      }).hasRequiredCleared,
    ).toBe(true)
    expect(
      resolveCorrectionAmounts({ ...base, codes: ['696'], draft: typed }).hasRequiredCleared,
    ).toBe(false)
    expect(
      resolveCorrectionAmounts({
        amountMode: 'optional',
        codes: ['696'],
        draft: draft({ lineAmounts: new Map([['696', '']]), referenceNumber: '' }),
        referenceMode: 'optional',
      }).hasRequiredCleared,
    ).toBe(false)
  })
})
