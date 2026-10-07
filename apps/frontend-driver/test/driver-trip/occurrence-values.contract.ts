/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type {
  DriverNfeProduct,
  DriverOccurrenceType,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  sanitizeDecimalInput,
  sanitizeReferenceNumberInput,
  toCanonicalDecimal,
  toReferenceNumber,
  DECLARED_AMOUNT_INPUT,
  QUANTITY_INPUT,
} from '../../src/modules/driver-trip/shared/occurrenceDecimalInput.service'
import {
  evaluateOccurrenceValues,
  resolveDefaultQuantityText,
  type OccurrenceItemDrafts,
} from '../../src/modules/driver-trip/shared/occurrenceDraftValues.service'
import { formatBrazilianUnitValue } from '../../src/modules/driver-trip/shared/occurrenceMoneyFormat.service'
import { listMissingOccurrenceFields } from '../../src/modules/driver-trip/shared/occurrenceRegistration.service'
import { resolveOccurrenceRequirements } from '../../src/modules/driver-trip/shared/occurrenceRequirements.service'

/**
 * Spec 247 (T5.3, RF11, CA07): a lista de produtos, a quantidade, a soma da linha e a geral, o valor
 * pago (por linha ou da ocorrência) e o número do documento do cliente — decididos no aparelho, sem
 * rede, pelos modos efetivos do snapshot. Os números do protótipo (`preview.html`) e os da nota de
 * referência do servidor (`driver-snapshot-document.golden.json`) são os de aqui.
 */
const BISCUIT: DriverNfeProduct = {
  code: 'P1',
  description: 'Biscoito',
  hasVaryingUnitValue: false,
  quantity: '3.0000',
  unit: 'CX',
  unitValue: '19.9950',
}
const CAKE: DriverNfeProduct = {
  code: 'P2',
  description: 'Bolo',
  hasVaryingUnitValue: false,
  quantity: '1.0000',
  unit: 'UN',
  unitValue: '57.2000',
}
const WATER: DriverNfeProduct = {
  code: 'P3',
  description: 'Fardo de água',
  hasVaryingUnitValue: true,
  quantity: '2.0000',
  unit: 'FD',
  unitValue: '10.0000',
}
const PRODUCTS = [BISCUIT, CAKE, WATER] as const

function buildType(overrides: Partial<DriverOccurrenceType> = {}): DriverOccurrenceType {
  return {
    attachmentMode: 'off',
    declaredAmountLabel: 'Valor pago pela loja',
    declaredAmountMode: 'off',
    declaredAmountScope: 'item',
    flow: 'document',
    id: 'type-1',
    itemsMode: 'required',
    name: 'Devolução parcial',
    noteMode: 'optional',
    photoMode: 'off',
    referenceNumberLabel: 'Número da NFD',
    referenceNumberMode: 'off',
    signatureMode: 'off',
    ...overrides,
  }
}

function pick(entries: Readonly<Record<string, string>>): OccurrenceItemDrafts {
  return Object.fromEntries(
    Object.entries(entries).map(([code, quantityText]) => [
      code,
      { declaredAmountText: '', isSelected: true, quantityText },
    ]),
  )
}

function evaluate(input: {
  readonly drafts?: OccurrenceItemDrafts
  readonly texts?: { readonly declaredAmount: string; readonly referenceNumber: string }
  readonly type?: DriverOccurrenceType
}) {
  return evaluateOccurrenceValues({
    drafts: input.drafts ?? {},
    products: PRODUCTS,
    requirements: resolveOccurrenceRequirements(input.type ?? buildType()),
    texts: input.texts ?? { declaredAmount: '', referenceNumber: '' },
  })
}

function missing(input: Parameters<typeof evaluate>[0]) {
  const type = input.type ?? buildType()
  const values = evaluate(input)
  return listMissingOccurrenceFields({
    hasNote: true,
    hasPhoto: true,
    hasProducts: values.facts.itemsSelectedCount > 0,
    type,
    values: values.facts,
  })
}

describe('o que o motorista digita vira o texto que o servidor aceita (nunca number)', () => {
  it('vírgula e ponto valem como separador; a conta sai em texto com ponto', () => {
    expect(toCanonicalDecimal('1,5')).toBe('1.5')
    expect(toCanonicalDecimal('57.20')).toBe('57.20')
    expect(toCanonicalDecimal('007')).toBe('7')
    expect(toCanonicalDecimal(',5')).toBe('0.5')
    expect(toCanonicalDecimal('3,')).toBe('3')
  })

  it('zero é um valor; vazio e só o separador são "não digitado"', () => {
    expect(toCanonicalDecimal('0')).toBe('0')
    expect(toCanonicalDecimal('0,00')).toBe('0.00')
    expect(toCanonicalDecimal('')).toBeUndefined()
    expect(toCanonicalDecimal('  ')).toBeUndefined()
    expect(toCanonicalDecimal(',')).toBeUndefined()
  })

  it('o campo não aceita o que o servidor recusaria', () => {
    expect(sanitizeDecimalInput({ limits: DECLARED_AMOUNT_INPUT, text: '12,345' })).toBe('12,34')
    expect(sanitizeDecimalInput({ limits: DECLARED_AMOUNT_INPUT, text: '1,2,3' })).toBe('1,23')
    expect(sanitizeDecimalInput({ limits: DECLARED_AMOUNT_INPUT, text: '-5' })).toBe('5')
    expect(sanitizeDecimalInput({ limits: DECLARED_AMOUNT_INPUT, text: 'R$ 5,00' })).toBe('5,00')
    expect(sanitizeDecimalInput({ limits: DECLARED_AMOUNT_INPUT, text: '12345678901' })).toBe(
      '1234567890',
    )
    expect(sanitizeDecimalInput({ limits: QUANTITY_INPUT, text: '2,5555' })).toBe('2,555')
    expect(sanitizeDecimalInput({ limits: QUANTITY_INPUT, text: '1234567890' })).toBe('123456789')
  })

  it('o número do documento só leva o que o padrão da API aceita, até 30; vazio é ausente', () => {
    expect(sanitizeReferenceNumberInput('NFD-45029/1.A ç!')).toBe('NFD-45029/1.A ')
    expect(sanitizeReferenceNumberInput('A'.repeat(40))).toHaveLength(30)
    expect(toReferenceNumber('  NFD 45029  ')).toBe('NFD 45029')
    expect(toReferenceNumber('   ')).toBeUndefined()
  })
})

describe('o valor unitário aparece como a nota o traz', () => {
  it('duas casas no mínimo, até quatro quando existem — nunca arredondado a centavos', () => {
    expect(formatBrazilianUnitValue('19.9950')).toBe('19,995')
    expect(formatBrazilianUnitValue('57.2000')).toBe('57,20')
    expect(formatBrazilianUnitValue('10')).toBe('10,00')
    expect(formatBrazilianUnitValue('0.3333')).toBe('0,3333')
    expect(formatBrazilianUnitValue('1234.5')).toBe('1.234,50')
    expect(formatBrazilianUnitValue('abc')).toBe('abc')
  })
})

describe('marcar o produto sugere a quantidade', () => {
  it('uma unidade; ou o que a nota tem, quando é menos de uma', () => {
    expect(resolveDefaultQuantityText(BISCUIT)).toBe('1')
    expect(resolveDefaultQuantityText({ ...BISCUIT, quantity: '0.5000' })).toBe('0,5')
    expect(resolveDefaultQuantityText({ ...BISCUIT, quantity: '1.0000' })).toBe('1')
  })
})

describe('a lista, a soma da linha e a soma geral (RF11, os números do protótipo)', () => {
  it('1 × 57,20 + 3 × 19,995 = 57,20 + 59,99 = 117,19, cada linha arredondada antes de somar', () => {
    const values = evaluate({ drafts: pick({ P1: '3', P2: '1' }) })

    const [biscuit, cake, water] = values.lines
    expect(biscuit?.lineAmountCents).toBe(5999n)
    expect(cake?.lineAmountCents).toBe(5720n)
    expect(water?.isSelected).toBe(false)
    expect(water?.lineAmountCents).toBeUndefined()
    expect(values.totals?.itemsSumCents).toBe(11719n)
    expect(values.totals?.declaredAmountCents).toBe(11719n)
  })

  it('quantidade com vírgula e três casas: 0,5 × 57,20 = 28,60', () => {
    const values = evaluate({ drafts: pick({ P2: '0,5' }) })

    expect(values.lines[1]?.quantity).toBe('0.5')
    expect(values.lines[1]?.lineAmountCents).toBe(2860n)
  })

  it('nada marcado: nada a somar', () => {
    const values = evaluate({})

    expect(values.totals).toBeUndefined()
    expect(values.payload).toEqual({})
  })

  it('o valor pago digitado na linha vence a soma da linha no total pago, e a soma dos produtos fica', () => {
    const drafts = {
      P2: { declaredAmountText: '50,00', isSelected: true, quantityText: '1' },
    }
    const values = evaluate({
      drafts,
      type: buildType({ declaredAmountMode: 'optional', declaredAmountScope: 'item' }),
    })

    expect(values.totals?.itemsSumCents).toBe(5720n)
    expect(values.totals?.declaredAmountCents).toBe(5000n)
    expect(values.lines[1]?.itemAmountCents).toBe(5000n)
  })

  it('valor pago 0 é aceito e diferente de vazio', () => {
    const drafts = { P2: { declaredAmountText: '0', isSelected: true, quantityText: '1' } }
    const values = evaluate({
      drafts,
      type: buildType({ declaredAmountMode: 'required', declaredAmountScope: 'item' }),
    })

    expect(values.totals?.declaredAmountCents).toBe(0n)
    expect(values.payload.items).toEqual([
      { declaredAmount: '0', productCode: 'P2', quantity: '1' },
    ])
    expect(values.facts.lineAmountMissingCount).toBe(0)
  })
})

describe('o corpo que sai pela fila: strings, só o que o servidor aceita (CA06, .strict())', () => {
  it('itens com código e quantidade — nunca preço, unidade, contratante nem escopo', () => {
    const values = evaluate({ drafts: pick({ P1: '2,5', P2: '1' }) })

    expect(values.payload.items).toEqual([
      { productCode: 'P1', quantity: '2.5' },
      { productCode: 'P2', quantity: '1' },
    ])
    for (const item of values.payload.items ?? []) {
      expect(Object.keys(item).sort()).not.toContain('unitValue')
      expect(Object.keys(item)).not.toContain('unit')
      expect(typeof item.quantity).toBe('string')
    }
  })

  it('o valor pago vai só no nível do escopo efetivo: linha com linhas marcadas', () => {
    const drafts = { P2: { declaredAmountText: '50,00', isSelected: true, quantityText: '1' } }
    const values = evaluate({
      drafts,
      texts: { declaredAmount: '199,99', referenceNumber: '' },
      type: buildType({ declaredAmountMode: 'optional', declaredAmountScope: 'item' }),
    })

    expect(values.payload.declaredAmount).toBeUndefined()
    expect(values.payload.items).toEqual([
      { declaredAmount: '50.00', productCode: 'P2', quantity: '1' },
    ])
  })

  it('o valor pago vai só no nível do escopo efetivo: escopo da ocorrência, sem valor nas linhas', () => {
    const drafts = { P2: { declaredAmountText: '50,00', isSelected: true, quantityText: '1' } }
    const values = evaluate({
      drafts,
      texts: { declaredAmount: '199,99', referenceNumber: '' },
      type: buildType({ declaredAmountMode: 'optional', declaredAmountScope: 'occurrence' }),
    })

    expect(values.payload.declaredAmount).toBe('199.99')
    expect(values.payload.items).toEqual([{ productCode: 'P2', quantity: '1' }])
    expect(values.totals?.declaredAmountCents).toBe(19999n)
    expect(values.totals?.itemsSumCents).toBe(5720n)
  })

  it('escopo "item" sem nenhuma linha marcada cai na ocorrência — como o servidor', () => {
    const values = evaluate({
      texts: { declaredAmount: '0', referenceNumber: '' },
      type: buildType({
        declaredAmountMode: 'optional',
        declaredAmountScope: 'item',
        itemsMode: 'optional',
      }),
    })

    expect(values.amountTarget).toBe('occurrence')
    expect(values.payload).toEqual({ declaredAmount: '0' })
  })

  it('Produtos desligado pela exceção: só o campo da ocorrência, e nenhum item sai', () => {
    const values = evaluate({
      drafts: pick({ P1: '1' }),
      texts: { declaredAmount: '10', referenceNumber: '' },
      type: buildType({ declaredAmountMode: 'optional', itemsMode: 'off' }),
    })

    expect(values.amountTarget).toBe('occurrence')
    expect(values.payload).toEqual({ declaredAmount: '10' })
  })

  it('o número do documento sai aparado; vazio some; tipo que o desliga não o manda', () => {
    const on = evaluate({
      texts: { declaredAmount: '', referenceNumber: '  NFD 45029 ' },
      type: buildType({ itemsMode: 'optional', referenceNumberMode: 'optional' }),
    })
    const empty = evaluate({
      texts: { declaredAmount: '', referenceNumber: '   ' },
      type: buildType({ itemsMode: 'optional', referenceNumberMode: 'optional' }),
    })
    const off = evaluate({
      texts: { declaredAmount: '', referenceNumber: 'NFD 45029' },
      type: buildType({ itemsMode: 'optional', referenceNumberMode: 'off' }),
    })

    expect(on.payload.referenceNumber).toBe('NFD 45029')
    expect(empty.payload.referenceNumber).toBeUndefined()
    expect(off.payload.referenceNumber).toBeUndefined()
  })

  it('valor pago de tipo que o desliga não sai, nem digitado antes de trocar de tipo', () => {
    const values = evaluate({
      drafts: { P2: { declaredAmountText: '50', isSelected: true, quantityText: '1' } },
      texts: { declaredAmount: '10', referenceNumber: '' },
      type: buildType({ declaredAmountMode: 'off' }),
    })

    expect(values.payload.declaredAmount).toBeUndefined()
    expect(values.payload.items).toEqual([{ productCode: 'P2', quantity: '1' }])
  })

  it('linha desmarcada não sai, mesmo com quantidade digitada', () => {
    const values = evaluate({
      drafts: { P1: { declaredAmountText: '', isSelected: false, quantityText: '2' } },
    })

    expect(values.payload.items).toBeUndefined()
  })
})

describe('o botão só libera com o exigido, sem rede (CA07)', () => {
  it('Produtos obrigatório: nada marcado segura o botão', () => {
    expect(missing({})).toEqual(['products'])
  })

  it('Produtos obrigatório com mínimo nulo exige todos os itens da nota; o mínimo numérico, esse tanto', () => {
    expect(missing({ drafts: pick({ P1: '1' }) })).toEqual(['productsMinimum'])
    expect(missing({ drafts: pick({ P1: '1', P2: '1', P3: '1' }) })).toEqual([])
    expect(
      missing({
        drafts: pick({ P1: '1' }),
        type: buildType({ itemsMinimumCount: 1 }),
      }),
    ).toEqual([])
    expect(
      missing({
        drafts: pick({ P1: '1' }),
        type: buildType({ itemsMinimumCount: 2 }),
      }),
    ).toEqual(['productsMinimum'])
    expect(
      missing({
        drafts: pick({ P1: '1', P2: '1' }),
        type: buildType({ itemsMinimumCount: 9 }),
      }),
    ).toEqual(['productsMinimum'])
  })

  it('Produtos opcional: nada marcado libera (a nota inteira)', () => {
    expect(missing({ type: buildType({ itemsMode: 'optional' }) })).toEqual([])
  })

  it('linha marcada sem quantidade, com zero ou acima da nota segura o botão', () => {
    const type = buildType({ itemsMinimumCount: 1 })

    expect(missing({ drafts: pick({ P2: '' }), type })).toEqual(['productQuantity'])
    expect(missing({ drafts: pick({ P2: '0' }), type })).toEqual(['productQuantity'])
    expect(missing({ drafts: pick({ P2: '1,001' }), type })).toEqual(['productQuantity'])
    expect(missing({ drafts: pick({ P2: '1' }), type })).toEqual([])
  })

  it('quantidade acima da nota fica dita na linha, e a soma dela não conta', () => {
    const values = evaluate({ drafts: pick({ P2: '2' }) })

    expect(values.lines[1]?.quantityProblem).toBe('above-note')
    expect(values.totals).toBeUndefined()
  })

  it('o número do documento exigido segura o botão; opcional e desligado não', () => {
    const base = { drafts: pick({ P2: '1' }) }
    const itemsOnly = { itemsMinimumCount: 1 } as const

    expect(
      missing({ ...base, type: buildType({ ...itemsOnly, referenceNumberMode: 'required' }) }),
    ).toEqual(['referenceNumber'])
    expect(
      missing({
        ...base,
        texts: { declaredAmount: '', referenceNumber: 'NFD 1' },
        type: buildType({ ...itemsOnly, referenceNumberMode: 'required' }),
      }),
    ).toEqual([])
    expect(
      missing({ ...base, type: buildType({ ...itemsOnly, referenceNumberMode: 'optional' }) }),
    ).toEqual([])
    expect(
      missing({ ...base, type: buildType({ ...itemsOnly, referenceNumberMode: 'off' }) }),
    ).toEqual([])
  })

  it('valor pago obrigatório por linha: toda linha marcada o pede; zero vale', () => {
    const type = buildType({
      declaredAmountMode: 'required',
      declaredAmountScope: 'item',
      itemsMinimumCount: 1,
    })
    const withoutAmount = pick({ P1: '1', P2: '1' })

    expect(missing({ drafts: withoutAmount, type })).toEqual(['itemDeclaredAmount'])
    expect(
      missing({
        drafts: {
          P1: { declaredAmountText: '0', isSelected: true, quantityText: '1' },
          P2: { declaredAmountText: '10', isSelected: true, quantityText: '1' },
        },
        type,
      }),
    ).toEqual([])
  })

  it('valor pago obrigatório da ocorrência: o campo da ocorrência o pede; zero vale', () => {
    const type = buildType({
      declaredAmountMode: 'required',
      declaredAmountScope: 'occurrence',
      itemsMinimumCount: 1,
    })
    const drafts = pick({ P2: '1' })

    expect(missing({ drafts, type })).toEqual(['declaredAmount'])
    expect(missing({ drafts, texts: { declaredAmount: '0', referenceNumber: '' }, type })).toEqual(
      [],
    )
  })

  it('valor pago opcional não segura; preço que varia na nota o exige na linha', () => {
    const type = buildType({
      declaredAmountMode: 'optional',
      declaredAmountScope: 'item',
      itemsMinimumCount: 1,
    })

    expect(missing({ drafts: pick({ P2: '1' }), type })).toEqual([])
    expect(missing({ drafts: pick({ P3: '1' }), type })).toEqual(['itemDeclaredAmount'])
    expect(
      missing({
        drafts: { P3: { declaredAmountText: '8', isSelected: true, quantityText: '1' } },
        type,
      }),
    ).toEqual([])
  })

  it('valor pago desligado não cobra nem o preço que varia', () => {
    expect(
      missing({
        drafts: pick({ P3: '1' }),
        type: buildType({ declaredAmountMode: 'off', itemsMinimumCount: 1 }),
      }),
    ).toEqual([])
  })

  it('Produtos obrigatório e nada marcado: falta só marcar — o valor pago espera as linhas', () => {
    expect(
      missing({
        type: buildType({ declaredAmountMode: 'required', declaredAmountScope: 'item' }),
      }),
    ).toEqual(['products'])
  })

  it('a ordem é a do formulário: produtos, valor pago, número, observação, foto, assinatura', () => {
    const type = buildType({
      attachmentMode: 'required',
      declaredAmountMode: 'required',
      declaredAmountScope: 'occurrence',
      itemsMinimumCount: 1,
      noteMode: 'required',
      photoMode: 'required',
      referenceNumberMode: 'required',
      signatureMode: 'required',
    })
    const values = evaluate({ type })

    expect(
      listMissingOccurrenceFields({
        hasNote: false,
        hasPhoto: false,
        hasProducts: false,
        type,
        values: values.facts,
      }),
    ).toEqual(['products', 'declaredAmount', 'referenceNumber', 'note', 'photo', 'signature'])
  })
})
