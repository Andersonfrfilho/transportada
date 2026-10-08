/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

import '@/modules/shared/i18n/i18n.service'
import { NfseNationalTaxationFields } from '@/modules/nfse-invoice/components/NfseNationalTaxationFields.component'

const CLASS_NAMES = { error: 'errorClass', field: 'fieldClass', hint: 'hintClass' } as const

function render(
  values: Readonly<{ nationalTaxationCode: string; simplesNationalRate: string }>,
  disabled = false,
): string {
  return renderToStaticMarkup(
    <NfseNationalTaxationFields
      classNames={CLASS_NAMES}
      disabled={disabled}
      onChange={() => undefined}
      values={values}
    />,
  )
}

type Field = Readonly<{ attribute: (name: string) => null | string; tag: string }>

function readAttribute(tag: string, name: string): null | string {
  const match = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)
  return match === null ? null : (match[1] ?? null)
}

function readInput(markup: string, labelText: string): Field {
  const labels = [...markup.matchAll(/<label[^>]*\sfor="([^"]+)"[^>]*>([^<]*)<\/label>/g)]
  const label = labels.find((candidate) => (candidate[2] ?? '').includes(labelText))
  const tag = [...markup.matchAll(/<input[^>]*>/g)]
    .map((match) => match[0])
    .find((candidate) => readAttribute(candidate, 'id') === label?.[1])
  if (tag === undefined) throw new Error(`campo sem rótulo associado: ${labelText}`)
  return { attribute: (name) => readAttribute(tag, name), tag }
}

function describedBy(
  markup: string,
  input: Field,
): readonly Readonly<{ role: null | string; text: string }>[] {
  const ids = (input.attribute('aria-describedby') ?? '').split(' ').filter((id) => id.length > 0)
  return ids.map((id) => {
    const element = [...markup.matchAll(/<(\w+)([^>]*)>([^<]*)<\/\1>/g)].find(
      (match) => readAttribute(match[2] ?? '', 'id') === id,
    )
    if (element === undefined) throw new Error(`descrição ausente: ${id}`)
    return { role: readAttribute(element[2] ?? '', 'role'), text: element[3] ?? '' }
  })
}

describe('campos do par nacional (spec 250 T4.1/T4.2)', () => {
  test('cada campo tem rótulo associado ao input e a ajuda ligada por aria-describedby', () => {
    const markup = render({ nationalTaxationCode: '', simplesNationalRate: '' })
    const code = readInput(markup, 'Código de tributação nacional (cTribNac)')
    const rate = readInput(markup, 'Alíquota efetiva do Simples Nacional (%)')

    expect(describedBy(markup, code).map((element) => element.text)).toEqual([
      'Par aceito pela prefeitura: 160201 + 160101 para transporte rodoviário de cargas em Ribeirão Preto.',
    ])
    expect(describedBy(markup, rate).map((element) => element.text)).toEqual([
      'Vai em tributos aproximados da nota. A Nota RP documenta mínimo de 4,50%.',
    ])
  })

  test('o campo vem vazio: nenhum código é pré-preenchido', () => {
    const markup = render({ nationalTaxationCode: '', simplesNationalRate: '' })

    expect(readInput(markup, 'cTribNac').attribute('value')).toBe('')
    expect(markup).not.toContain('value="160201"')
  })

  test('aceita só seis dígitos pelo teclado numérico e a alíquota em decimal', () => {
    const markup = render({ nationalTaxationCode: '160201', simplesNationalRate: '4,5' })
    const code = readInput(markup, 'cTribNac')
    const rate = readInput(markup, 'Simples Nacional')

    expect(code.attribute('value')).toBe('160201')
    expect(code.attribute('inputmode')).toBe('numeric')
    expect(code.attribute('maxlength')).toBe('6')
    expect(rate.attribute('value')).toBe('4,5')
    expect(rate.attribute('inputmode')).toBe('decimal')
  })

  test('valor válido ou vazio não acusa erro nem marca o campo inválido', () => {
    const markup = render({ nationalTaxationCode: '160201', simplesNationalRate: '' })

    expect(markup).not.toContain('role="alert"')
    expect(readInput(markup, 'cTribNac').attribute('aria-invalid')).toBe('false')
    expect(readInput(markup, 'Simples Nacional').attribute('aria-invalid')).toBe('false')
  })

  test('valor inválido marca o campo, mostra o erro com role alert e o liga ao input', () => {
    const markup = render({ nationalTaxationCode: '1602', simplesNationalRate: '101' })
    const code = readInput(markup, 'cTribNac')
    const rate = readInput(markup, 'Simples Nacional')

    expect(code.attribute('aria-invalid')).toBe('true')
    expect(rate.attribute('aria-invalid')).toBe('true')

    const codeError = describedBy(markup, code).find((element) => element.role === 'alert')
    const rateError = describedBy(markup, rate).find((element) => element.role === 'alert')
    expect(codeError?.text).toBe('O código de tributação nacional tem 6 dígitos.')
    expect(rateError?.text).toBe(
      'A alíquota do Simples precisa ser um percentual de 0 a 100, com até 6 casas.',
    )
  })

  test('desabilitado trava os dois campos, e a classe do módulo chega ao contêiner', () => {
    const markup = render({ nationalTaxationCode: '', simplesNationalRate: '' }, true)

    expect(readInput(markup, 'cTribNac').tag).toContain(' disabled=""')
    expect(readInput(markup, 'Simples Nacional').tag).toContain(' disabled=""')
    expect(markup).toContain('class="fieldClass"')
    expect(markup).toContain('class="hintClass"')
  })
})
