/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §2): `UNSAFE_EMAIL_HTML_PATTERN` é o filtro grosso do worker (regex POSIX do Postgres), cópia por
 * valor da regra da API. Aqui o valor e a tabela copiada; o veredito de cada caso contra o Postgres está em
 * `occurrence-automatic-mail-sweep.integration.test.ts`.
 */
import { describe, expect, test } from 'bun:test'

import { UNSAFE_EMAIL_HTML_PATTERN } from '../../src/occurrence-automatic-mail-sweep/domain/occurrence-automatic-mail-sweep.constant.js'
import { OCCURRENCE_MAIL_UNSAFE_HTML_CASES } from '../fixtures/occurrence-mail-unsafe-html-cases.fixture.js'

describe('o filtro grosso de HTML inseguro da fila (spec 272)', () => {
  test('o padrão tem o valor combinado', () => {
    expect(UNSAFE_EMAIL_HTML_PATTERN).toBe(
      '<(script|iframe|form|object|embed)\\y|[\\s/"\']on[a-z]+\\s*=|(javascript|vbscript):|<[a-zA-Z/!]([^>"\']|"[^"]*"|\'[^\']*\')*(\\{\\{|"[^"]*\\{\\{|\'[^\']*\\{\\{)|<style\\y([^<]|<[^/])*\\{\\{',
    )
  })

  test('a tabela copiada tem os 42 casos da API', () => {
    expect(OCCURRENCE_MAIL_UNSAFE_HTML_CASES).toHaveLength(42)
  })

  test('nunca é mais estrito que a API: caso seguro na API fica fora do filtro', () => {
    for (const entry of OCCURRENCE_MAIL_UNSAFE_HTML_CASES) {
      if (entry.rules.length === 0) expect(entry.worker).toBe('deixa para a API')
    }
  })
})
