/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  insertMailTemplateVariable,
  isItemVariableEnabled,
} from '../../src/modules/delivery-clients/shared/mailTemplateVariableInsertion.service'

describe('insertMailTemplateVariable', () => {
  test('inserts the variable at the cursor position, with no selection', () => {
    const result = insertMailTemplateVariable({
      name: 'cliente',
      selectionEnd: 5,
      selectionStart: 5,
      text: 'Olá, tudo bem?',
    })
    expect(result.text).toBe('Olá, {cliente}tudo bem?')
    expect(result.cursorPosition).toBe(5 + '{cliente}'.length)
  })

  test('replaces the selected text with the variable', () => {
    const result = insertMailTemplateVariable({
      name: 'motivo',
      selectionEnd: 8,
      selectionStart: 0,
      text: 'endereço não localizado',
    })
    expect(result.text).toBe('{motivo} não localizado')
    expect(result.cursorPosition).toBe('{motivo}'.length)
  })

  test('inserts at the end when the cursor is past the text length', () => {
    const result = insertMailTemplateVariable({
      name: 'uf',
      selectionEnd: 999,
      selectionStart: 999,
      text: 'abc',
    })
    expect(result.text).toBe('abc{uf}')
    expect(result.cursorPosition).toBe('abc{uf}'.length)
  })

  test('inserts at the start with a negative cursor', () => {
    const result = insertMailTemplateVariable({
      name: 'cep_correto',
      selectionEnd: -3,
      selectionStart: -3,
      text: 'abc',
    })
    expect(result.text).toBe('{cep_correto}abc')
  })
})

describe('isItemVariableEnabled', () => {
  test('is only true when the focused field is itemText', () => {
    expect(isItemVariableEnabled('itemText')).toBe(true)
    expect(isItemVariableEnabled('subject')).toBe(false)
    expect(isItemVariableEnabled('intro')).toBe(false)
    expect(isItemVariableEnabled('closing')).toBe(false)
    expect(isItemVariableEnabled(undefined)).toBe(false)
  })
})
