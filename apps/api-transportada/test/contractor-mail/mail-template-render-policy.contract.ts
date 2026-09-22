/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 150 T402 (RF12/RF14): validação e renderização puras dos modelos de e-mail — lista fechada de
 * variáveis por tipo, variável de item só no texto do item, chaves soltas recusadas, escape no html.
 */
import { describe, expect, test } from 'bun:test'

import {
  CONTRACTOR_MAIL_TEMPLATE_TYPES,
  MAIL_TEMPLATE_CATALOG,
} from '../../src/contractor-mail/domain/mail-template-catalog.constant.js'
import {
  renderMailTemplate,
  validateMailTemplate,
} from '../../src/contractor-mail/domain/mail-template-render.policy.js'

const SUGGESTED = MAIL_TEMPLATE_CATALOG.address_correction.suggestedTemplate
const CONTENT = {
  closing: SUGGESTED.closing,
  intro: SUGGESTED.intro,
  itemText: SUGGESTED.itemText,
  subject: SUGGESTED.subject,
}

function validate(overrides: Partial<typeof CONTENT>) {
  return validateMailTemplate({
    content: { ...CONTENT, ...overrides },
    mailType: 'address_correction',
  })
}

describe('mail template validation (spec 150 T402)', () => {
  test('the suggested template of every catalog type is valid', () => {
    for (const mailType of CONTRACTOR_MAIL_TEMPLATE_TYPES) {
      const { closing, intro, itemText, subject } =
        MAIL_TEMPLATE_CATALOG[mailType].suggestedTemplate
      expect(
        validateMailTemplate({ content: { closing, intro, itemText, subject }, mailType }),
      ).toEqual([])
    }
  })

  test('the catalog declares the variables of RF14, each with a description', () => {
    const entry = MAIL_TEMPLATE_CATALOG.address_correction
    expect(entry.mailVariables.map((variable) => variable.name)).toEqual([
      'contratante',
      'quantidade',
      'clientes',
      'transportadora',
      'operador',
    ])
    expect(entry.itemVariables.map((variable) => variable.name)).toEqual([
      'cliente',
      'endereco_como_veio',
      'endereco_correto',
      'motivo',
      'cep_como_veio',
      'cep_correto',
      'municipio',
      'uf',
    ])
    for (const variable of [...entry.mailVariables, ...entry.itemVariables]) {
      expect(variable.description.length).toBeGreaterThan(0)
    }
  })

  test('refuses an unknown variable on the field it appears in', () => {
    expect(validate({ subject: 'Olá {desconhecida}' })).toEqual([
      { field: 'subject', message: '{desconhecida} is not a variable of address_correction' },
    ])
  })

  test('refuses an item variable outside itemText, and accepts it inside', () => {
    expect(
      validate({ intro: 'Endereço {endereco_correto}', closing: 'CEP {cep_correto}' }),
    ).toEqual([
      {
        field: 'intro',
        message: '{endereco_correto} is an item variable and is only allowed in itemText',
      },
      {
        field: 'closing',
        message: '{cep_correto} is an item variable and is only allowed in itemText',
      },
    ])
    expect(validate({ itemText: '{cliente} {endereco_correto} {municipio}/{uf}' })).toEqual([])
  })

  test('accepts an email variable inside itemText', () => {
    expect(validate({ itemText: '{motivo} — pedido de {transportadora}' })).toEqual([])
  })

  test('refuses unmatched or malformed braces', () => {
    for (const text of [
      'abre { e não fecha',
      'fecha } sem abrir',
      '{contratante',
      '{}',
      '{Contratante}',
      '{{contratante}}',
      '{nome com espaço}',
    ]) {
      expect(validate({ intro: text })).toEqual([
        { field: 'intro', message: 'has an unmatched { or }' },
      ])
    }
  })

  test('reports every invalid field at once, one message per variable', () => {
    const errors = validate({
      closing: '{uf}',
      intro: '{x} e {x} de novo',
      subject: '{',
    })
    expect(errors.map((error) => error.field)).toEqual(['subject', 'intro', 'closing'])
    expect(errors.filter((error) => error.field === 'intro')).toHaveLength(1)
  })
})

describe('mail template rendering (spec 150 T402)', () => {
  const values = { contratante: 'Loja "A" & <B>', quantidade: '2' }

  test('text keeps values literal', () => {
    expect(
      renderMailTemplate({ format: 'text', text: 'Olá, {contratante} ({quantidade})', values }),
    ).toBe('Olá, Loja "A" & <B> (2)')
  })

  test('html escapes the values and the typed text alike', () => {
    expect(renderMailTemplate({ format: 'html', text: '<i>Olá</i>, {contratante}', values })).toBe(
      '&lt;i&gt;Olá&lt;/i&gt;, Loja &quot;A&quot; &amp; &lt;B&gt;',
    )
  })

  test('a variable without value stays as written', () => {
    expect(renderMailTemplate({ format: 'text', text: 'Oi {operador}', values })).toBe(
      'Oi {operador}',
    )
  })
})
