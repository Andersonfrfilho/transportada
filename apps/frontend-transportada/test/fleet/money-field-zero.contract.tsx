/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import { FleetMoneyField } from '@/modules/fleet/components/FleetField.component'
import { maskTypedAmount, maskTypedAmountKeepingZero } from '@/modules/shared/decimalAmount.service'

const NOOP = (): void => undefined

function shownValue(props: { keepsZero?: boolean; value: string }): string {
  const html = renderToStaticMarkup(
    <FleetMoneyField
      label="Diária"
      scale={2}
      value={props.value}
      onChange={NOOP}
      {...(props.keepsZero === undefined ? {} : { keepsZero: props.keepsZero })}
    />,
  )
  const match = /<input[^>]*value="([^"]*)"/.exec(html)
  if (match === null) throw new Error('input sem value')

  return match[1] ?? ''
}

describe('o campo de diária mostra o zero que o estado guarda (spec 244 T3, D3)', () => {
  it('estado 0,00 com keepsZero: o input mostra 0,00', () => {
    expect(shownValue({ keepsZero: true, value: '0,00' })).toBe('0,00')
  })

  it('estado 120,00: mostra 120,00; vazio: mostra vazio', () => {
    expect(shownValue({ keepsZero: true, value: '120,00' })).toBe('120,00')
    expect(shownValue({ keepsZero: true, value: '' })).toBe('')
  })

  it('o campo de custo (sem a opção) continua vazio para zero', () => {
    expect(shownValue({ value: '0,00' })).toBe('')
    expect(shownValue({ value: '120,00' })).toBe('120,00')
  })
})

describe('máscara que preserva zero, no nível da função', () => {
  const input = (value: string) => ({ scale: 2, value })

  it('zero formatado volta como 0,00; o resto segue a máscara comum', () => {
    expect(maskTypedAmountKeepingZero(input('0,00'))).toBe('0,00')
    expect(maskTypedAmountKeepingZero(input('1'))).toBe(maskTypedAmount(input('1')))
    expect(maskTypedAmountKeepingZero(input('12000'))).toBe('120,00')
    expect(maskTypedAmountKeepingZero(input(''))).toBe('')
  })

  it('a digitação continua sensata: o que o campo grava ao digitar é a máscara comum', () => {
    expect(maskTypedAmount(input('0'))).toBe('')
    expect(maskTypedAmount(input('0,0'))).toBe('')
    expect(maskTypedAmount(input('5'))).toBe('0,05')
  })

  it('apagar tudo a partir de 0,00 chega a vazio', () => {
    expect(maskTypedAmount(input('0,0'))).toBe('')
    expect(maskTypedAmount(input(''))).toBe('')
  })

  it('maskTypedAmount não mudou: zero continua vazio', () => {
    expect(maskTypedAmount(input('0,00'))).toBe('')
  })
})
