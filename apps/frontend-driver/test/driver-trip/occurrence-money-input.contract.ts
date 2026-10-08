/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type {
  DriverNfeProduct,
  DriverOccurrenceType,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import { evaluateOccurrenceValues } from '../../src/modules/driver-trip/shared/occurrenceDraftValues.service'
import {
  isMoneyInputAtLimit,
  maskMoneyInput,
  unmaskMoneyText,
} from '../../src/modules/driver-trip/shared/occurrenceMoneyMask.service'
import {
  sanitizeQuantityInput,
  toCanonicalDecimal,
} from '../../src/modules/driver-trip/shared/occurrenceDecimalInput.service'
import { resolveOccurrenceRequirements } from '../../src/modules/driver-trip/shared/occurrenceRequirements.service'

/**
 * Spec 247 (T7.2, A3): o valor pago usa a MESMA máscara de centavos do painel (só dígito entra, os dois
 * últimos são os centavos) e NUNCA descarta um dígito em silêncio: o que está na tela é o que vai.
 */
function type(characters: string): string {
  let text = ''
  for (const character of characters) {
    text = maskMoneyInput({ previousText: text, text: `${text}${character}` })
  }
  return text
}

describe('a máscara de centavos do valor pago (igual à do painel)', () => {
  it('"1.500" digitado vira 15,00 — visível ao vivo, e nenhum dígito some', () => {
    expect(type('1.500')).toBe('15,00')
    expect(type('1500')).toBe('15,00')
  })

  it('colar "1.234,56" grava 1.234,56 (e não 1.23)', () => {
    expect(maskMoneyInput({ previousText: '', text: '1.234,56' })).toBe('1.234,56')
    expect(unmaskMoneyText('1.234,56')).toBe('1234.56')
  })

  it('"57,2" digitado: cada tecla ecoa na hora, sem perder dígito', () => {
    expect(type('5')).toBe('0,05')
    expect(type('57')).toBe('0,57')
    expect(type('57,')).toBe('0,57')
    expect(type('57,2')).toBe('5,72')
  })

  it('colagem com texto: "R$ 57,20" → 57,20', () => {
    expect(maskMoneyInput({ previousText: '', text: 'R$ 57,20' })).toBe('57,20')
  })

  it('zero é valor: "0" e "0,00" mascaram para 0,00 e vão como "0.00"; vazio não é valor', () => {
    expect(type('0')).toBe('0,00')
    expect(type('0000')).toBe('0,00')
    expect(unmaskMoneyText('0,00')).toBe('0.00')
    expect(unmaskMoneyText('')).toBeUndefined()
    expect(maskMoneyInput({ previousText: '', text: '' })).toBe('')
  })

  it('apagar com o teclado: dígito a dígito, e o 0,00 some no próximo apagar', () => {
    expect(maskMoneyInput({ previousText: '1,23', text: '1,2' })).toBe('0,12')
    expect(maskMoneyInput({ previousText: '0,05', text: '0,0' })).toBe('0,00')
    expect(maskMoneyInput({ previousText: '0,00', text: '0,0' })).toBe('')
    expect(maskMoneyInput({ previousText: '5,00', text: '' })).toBe('')
  })

  it('teclas repetidas: zeros à esquerda não contam e o texto fica estável', () => {
    expect(type('0005')).toBe('0,05')
    expect(type('1111')).toBe('11,11')
  })

  it('milhar com ponto, em pt-BR', () => {
    expect(type('123456')).toBe('1.234,56')
    expect(type('123456789')).toBe('1.234.567,89')
  })

  it('o teto são 10 dígitos inteiros + 2 centavos: além dele a tela avisa (nunca ignora calada)', () => {
    const atLimit = type('999999999999')
    expect(atLimit).toBe('9.999.999.999,99')
    expect(isMoneyInputAtLimit(atLimit)).toBe(true)
    expect(unmaskMoneyText(atLimit)).toBe('9999999999.99')
    expect(type('9999999999999')).toBe(atLimit)
    expect(isMoneyInputAtLimit('15,00')).toBe(false)
    expect(isMoneyInputAtLimit('')).toBe(false)
  })

  it('o texto enviado casa com DECLARED_AMOUNT_DECIMAL da API', () => {
    const pattern = /^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/u
    for (const text of ['0,00', '0,05', '57,20', '1.234,56', '9.999.999.999,99']) {
      expect(unmaskMoneyText(text)).toMatch(pattern)
    }
  })
})

describe('o valor pago mascarado entra na conta e no corpo do envio', () => {
  const CAKE: DriverNfeProduct = {
    code: 'P2',
    description: 'Bolo',
    hasVaryingUnitValue: false,
    quantity: '1.0000',
    unit: 'UN',
    unitValue: '57.2000',
  }
  const PAID_TYPE: DriverOccurrenceType = {
    declaredAmountLabel: 'Valor pago pela loja',
    declaredAmountMode: 'optional',
    declaredAmountScope: 'occurrence',
    flow: 'document',
    id: 'type-1',
    itemsMode: 'optional',
    name: 'Devolução',
  }

  function evaluate(declaredAmount: string) {
    return evaluateOccurrenceValues({
      drafts: {},
      products: [CAKE],
      requirements: resolveOccurrenceRequirements(PAID_TYPE),
      texts: { declaredAmount, referenceNumber: '' },
    })
  }

  it('"1.234,56" vai como "1234.56"', () => {
    expect(evaluate('1.234,56').payload.declaredAmount).toBe('1234.56')
  })

  it('"0,00" é um valor ("0.00"), e vazio não manda nada', () => {
    const zero = evaluate('0,00')
    expect(zero.payload.declaredAmount).toBe('0.00')
    expect(zero.facts.hasDeclaredAmount).toBe(true)
    expect(evaluate('').payload.declaredAmount).toBeUndefined()
    expect(evaluate('').facts.hasDeclaredAmount).toBe(false)
  })

  it('por linha: o valor pago mascarado da linha vence a soma calculada', () => {
    const values = evaluateOccurrenceValues({
      drafts: { P2: { declaredAmountText: '50,00', isSelected: true, quantityText: '1' } },
      products: [CAKE],
      requirements: resolveOccurrenceRequirements({ ...PAID_TYPE, declaredAmountScope: 'item' }),
      texts: { declaredAmount: '', referenceNumber: '' },
    })
    expect(values.payload.items?.[0]?.declaredAmount).toBe('50.00')
    expect(values.totals?.declaredAmountCents).toBe(5000n)
  })
})

describe('a quantidade (até 3 casas) não descarta dígito em silêncio', () => {
  it('"," ou "." valem como separador; o campo mostra com vírgula', () => {
    expect(sanitizeQuantityInput('2.5')).toBe('2,5')
    expect(sanitizeQuantityInput('2,5')).toBe('2,5')
    expect(sanitizeQuantityInput('abc3')).toBe('3')
  })

  it('casas a mais ficam como digitadas (a tela marca, não corta)', () => {
    expect(sanitizeQuantityInput('2,5555')).toBe('2,5555')
    expect(sanitizeQuantityInput('1234567890')).toBe('1234567890')
    expect(toCanonicalDecimal(sanitizeQuantityInput('2.5555'))).toBe('2.5555')
  })

  const CAKE: DriverNfeProduct = {
    code: 'P2',
    description: 'Bolo',
    hasVaryingUnitValue: false,
    quantity: '9.0000',
    unit: 'UN',
    unitValue: '57.2000',
  }
  const TYPE: DriverOccurrenceType = {
    flow: 'document',
    id: 'type-1',
    itemsMode: 'required',
    name: 'Devolução',
  }

  function problemOf(quantityText: string) {
    const values = evaluateOccurrenceValues({
      drafts: { P2: { declaredAmountText: '', isSelected: true, quantityText } },
      products: [CAKE],
      requirements: resolveOccurrenceRequirements(TYPE),
      texts: { declaredAmount: '', referenceNumber: '' },
    })
    return { facts: values.facts, line: values.lines[0] }
  }

  it('4 casas: problema "too-many-decimals", sem quantidade, e o botão fica bloqueado', () => {
    const { facts, line } = problemOf('2,5555')
    expect(line?.quantityProblem).toBe('too-many-decimals')
    expect(line?.quantity).toBeUndefined()
    expect(facts.hasInvalidItemQuantity).toBe(true)
  })

  it('3 casas passam; inteiro com mais de 9 dígitos é "too-many-digits"', () => {
    expect(problemOf('2,555').line?.quantity).toBe('2.555')
    expect(problemOf('1,5').line?.quantity).toBe('1.5')
    expect(problemOf('1234567890').line?.quantityProblem).toBe('too-many-digits')
  })
})
