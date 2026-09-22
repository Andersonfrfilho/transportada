/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  MAIL_TEMPLATE_VALIDATION_ERROR,
  tokenizeTemplate,
  validateMailTemplateContent,
  validateMailTemplateName,
} from '../../src/modules/delivery-clients/shared/contractorMailTemplate.validation'
import type { MailTemplateCatalogEntry } from '../../src/modules/delivery-clients/shared/contractorMailTemplates.types'

const CATALOG_ENTRY: MailTemplateCatalogEntry = {
  itemVariables: [{ description: 'Motivo', name: 'motivo' }],
  label: 'Correção de endereço de entrega',
  mailType: 'address_correction',
  mailVariables: [
    { description: 'Contratante', name: 'contratante' },
    { description: 'Operador', name: 'operador' },
  ],
  suggestedTemplate: {
    closing: '{operador}',
    intro: 'Olá, {contratante}',
    itemText: 'Motivo: {motivo}.',
    name: 'Padrão',
    subject: 'Correção de endereço — {clientes}',
  },
}

const VALID_CONTENT = {
  closing: '{operador}',
  intro: 'Olá, {contratante}',
  itemText: 'Motivo: {motivo}.',
  subject: 'Correção de endereço',
}

describe('contractor mail template validation — name', () => {
  test('requires a name', () => {
    expect(validateMailTemplateName('  ')).toBe(MAIL_TEMPLATE_VALIDATION_ERROR.NAME_REQUIRED)
  })

  test('refuses a name over 120 characters', () => {
    expect(validateMailTemplateName('a'.repeat(121))).toBe(
      MAIL_TEMPLATE_VALIDATION_ERROR.NAME_TOO_LONG,
    )
  })

  test('accepts a name within the limit', () => {
    expect(validateMailTemplateName('Padrão')).toBeUndefined()
  })

  /** Rodada de correção da Fase 4, item 6: mesma regra do texto — conta o nome cru, sem aparar. */
  test('conta o nome cru, sem aparar, igual à CHECK do banco', () => {
    const paddedWithinTrimmedLimit = `  ${'a'.repeat(119)}  ` // aparado: 119, cru: 123
    expect(validateMailTemplateName(paddedWithinTrimmedLimit)).toBe(
      MAIL_TEMPLATE_VALIDATION_ERROR.NAME_TOO_LONG,
    )
  })
})

describe('contractor mail template validation — content', () => {
  test('accepts the suggested template as-is', () => {
    expect(
      validateMailTemplateContent({ catalogEntry: CATALOG_ENTRY, content: VALID_CONTENT }),
    ).toEqual([])
  })

  test('requires subject, intro and closing, but not itemText', () => {
    const errors = validateMailTemplateContent({
      catalogEntry: CATALOG_ENTRY,
      content: { closing: '', intro: '', itemText: '', subject: '' },
    })
    const fields = errors.map((error) => error.field)
    expect(fields).toContain('subject')
    expect(fields).toContain('intro')
    expect(fields).toContain('closing')
    expect(fields).not.toContain('itemText')
  })

  test('refuses text over the 4000-character limit on a non-subject field', () => {
    const errors = validateMailTemplateContent({
      catalogEntry: CATALOG_ENTRY,
      content: { ...VALID_CONTENT, closing: 'a'.repeat(4001) },
    })
    expect(errors).toContainEqual({
      field: 'closing',
      message: MAIL_TEMPLATE_VALIDATION_ERROR.TEXT_TOO_LONG,
    })
  })

  /**
   * Rodada de correção da Fase 4, item 6: a CHECK do banco mede `length(coluna)` — o texto **cru**
   * que fica armazenado, não o texto aparado. Contar pelo texto aparado deixa passar um valor que o
   * `PATCH` vai recusar (`400`) depois, porque o teto do Zod (`.trim().max(...)`) e a CHECK do banco
   * também operam sobre o texto que efetivamente é gravado, incluindo os espaços de borda que o
   * operador digitou antes de o navegador aparar em algum outro ponto do fluxo.
   */
  test('conta o texto cru, sem aparar, igual à CHECK do banco', () => {
    const paddedWithinTrimmedLimit = `  ${'a'.repeat(3999)}  ` // aparado: 3999, cru: 4003
    const errors = validateMailTemplateContent({
      catalogEntry: CATALOG_ENTRY,
      content: { ...VALID_CONTENT, closing: paddedWithinTrimmedLimit },
    })
    expect(errors).toContainEqual({
      field: 'closing',
      message: MAIL_TEMPLATE_VALIDATION_ERROR.TEXT_TOO_LONG,
    })
  })

  test('refuses a subject over 200 characters', () => {
    const errors = validateMailTemplateContent({
      catalogEntry: CATALOG_ENTRY,
      content: { ...VALID_CONTENT, subject: 'a'.repeat(201) },
    })
    expect(errors).toContainEqual({
      field: 'subject',
      message: MAIL_TEMPLATE_VALIDATION_ERROR.TEXT_TOO_LONG,
    })
  })

  test('refuses a line break in the subject', () => {
    const errors = validateMailTemplateContent({
      catalogEntry: CATALOG_ENTRY,
      content: { ...VALID_CONTENT, subject: 'Linha 1\nLinha 2' },
    })
    expect(errors).toContainEqual({
      field: 'subject',
      message: MAIL_TEMPLATE_VALIDATION_ERROR.SUBJECT_HAS_LINE_BREAK,
    })
  })

  test('refuses an item variable outside itemText', () => {
    const errors = validateMailTemplateContent({
      catalogEntry: CATALOG_ENTRY,
      content: { ...VALID_CONTENT, intro: 'Olá {motivo}' },
    })
    expect(errors).toContainEqual({
      field: 'intro',
      message: MAIL_TEMPLATE_VALIDATION_ERROR.ITEM_VARIABLE_OUTSIDE_ITEM_TEXT,
    })
  })

  test('accepts a mail variable inside itemText', () => {
    const errors = validateMailTemplateContent({
      catalogEntry: CATALOG_ENTRY,
      content: { ...VALID_CONTENT, itemText: 'Para {contratante}: {motivo}.' },
    })
    expect(errors).toEqual([])
  })

  test('refuses a variable unknown to the catalog', () => {
    const errors = validateMailTemplateContent({
      catalogEntry: CATALOG_ENTRY,
      content: { ...VALID_CONTENT, closing: '{nao_existe}' },
    })
    expect(errors).toContainEqual({
      field: 'closing',
      message: MAIL_TEMPLATE_VALIDATION_ERROR.UNKNOWN_VARIABLE,
    })
  })

  test('refuses a loose brace', () => {
    const errors = validateMailTemplateContent({
      catalogEntry: CATALOG_ENTRY,
      content: { ...VALID_CONTENT, closing: 'Atenciosamente {' },
    })
    expect(errors).toContainEqual({
      field: 'closing',
      message: MAIL_TEMPLATE_VALIDATION_ERROR.UNMATCHED_BRACE,
    })
  })
})

describe('tokenizeTemplate', () => {
  test('splits text and variables', () => {
    expect(tokenizeTemplate('Olá {contratante}, tudo bem?')).toEqual([
      { kind: 'text', value: 'Olá ' },
      { kind: 'variable', name: 'contratante' },
      { kind: 'text', value: ', tudo bem?' },
    ])
  })

  test('rejects an unmatched closing brace', () => {
    expect(tokenizeTemplate('oops }')).toBeUndefined()
  })

  test('rejects a malformed variable name', () => {
    expect(tokenizeTemplate('{Maiuscula}')).toBeUndefined()
    expect(tokenizeTemplate('{}')).toBeUndefined()
    expect(tokenizeTemplate('{{x}}')).toBeUndefined()
  })
})
