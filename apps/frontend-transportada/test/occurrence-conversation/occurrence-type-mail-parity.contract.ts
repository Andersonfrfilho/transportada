/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  interpolateMailTemplate,
  OCCURRENCE_MAIL_SAMPLE_VALUES,
  OCCURRENCE_MAIL_VARIABLE_NAMES,
  renderContractorMailPreview,
} from '../../src/modules/occurrence-conversation/shared/occurrenceTypeMailTemplate.service'

/**
 * Spec 271: a lista de variáveis do editor é cópia por valor da lista fechada da API
 * (`occurrence-contractor-mail.constant.ts`) — mesmo molde de `mail-template-variable-parity.contract.ts`: o caminho
 * relativo entre apps só dentro de um teste, nunca um `import` de código.
 */
const API_CONSTANT_SOURCE = new URL(
  '../../../api-transportada/src/occurrence-conversation/domain/occurrence-contractor-mail.constant.ts',
  import.meta.url,
)

describe('as variáveis do e-mail à contratante no editor do tipo (spec 271)', () => {
  test('a lista é a da API, na mesma ordem', async () => {
    const source = await Bun.file(API_CONSTANT_SOURCE).text()
    const block = /OCCURRENCE_CONTRACTOR_MAIL_VARIABLES[^=]*=\s*\[([\s\S]*?)\n\]/u.exec(source)
    if (block?.[1] === undefined) throw new Error('API_CONSTANT_NOT_FOUND_MAIL_VARIABLES')
    const apiNames = [...block[1].matchAll(/name: '([A-Za-z0-9_]+)'/gu)].map(
      (match) => match[1] ?? '',
    )

    expect<readonly string[]>([...OCCURRENCE_MAIL_VARIABLE_NAMES]).toEqual(apiNames)
  })

  test('cada variável tem valor de exemplo', () => {
    for (const name of OCCURRENCE_MAIL_VARIABLE_NAMES) {
      expect(OCCURRENCE_MAIL_SAMPLE_VALUES[name].length).toBeGreaterThan(0)
    }
  })

  test('interpola {{campo}} como o módulo: espaços tolerados, ausente sai vazio', () => {
    expect(
      interpolateMailTemplate('Nota {{ numeroNota }} [{{desconhecida}}]', { numeroNota: '1/1' }),
    ).toBe('Nota 1/1 []')
  })

  test('a prévia troca as variáveis por exemplos e deixa o assunto numa linha só', () => {
    const preview = renderContractorMailPreview({
      body: 'Itens:\n{{linhasItens}}',
      subject: 'NF {{numeroNota}}\n— {{contratante}}',
    })

    expect(preview.subject).toBe('NF 123456/1 — Contratante Exemplo')
    expect(preview.body).toContain('7000001 01 – PRODUTO EXEMPLO A 500G')
  })
})
