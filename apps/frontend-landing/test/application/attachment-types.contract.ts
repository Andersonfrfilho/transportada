/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { ATTACHMENT_TYPES } from '../../src/modules/application/shared/attachmentClient.service'
import { DOCUMENT_FIELDS } from '../../src/modules/application/shared/preRegistration.service'

/**
 * ⚠️ Cópia por valor de `AGGREGATE_APPLICATION_ATTACHMENT_TYPES` da api. Se as duas divergirem, o
 * anexo volta `400` e se perde em silêncio — a falha de upload não bloqueia o envio (spec 070), que
 * é justamente o que a tornaria invisível.
 */
const API_ATTACHMENT_TYPES = [
  'address_proof',
  'ccmei',
  'cnh',
  'company_document',
  'crlv',
  'other',
] as const

describe('os tipos de anexo afirmados na fronteira', () => {
  test('a landing conhece exatamente os tipos que a api aceita', () => {
    expect([...ATTACHMENT_TYPES].sort()).toEqual([...API_ATTACHMENT_TYPES].sort())
  })

  test('todo campo da tela manda um tipo que a api aceita', () => {
    for (const document of DOCUMENT_FIELDS) {
      expect(API_ATTACHMENT_TYPES).toContain(document.type)
    }
  })

  /** `ccmei` fica: linha já gravada não se reescreve, senão o operador perde o rótulo que aprovou. */
  test('o tipo antigo do CCMEI continua aceito', () => {
    expect(ATTACHMENT_TYPES).toContain('ccmei')
  })
})
