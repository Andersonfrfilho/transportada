/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 237 T4.6b (ADR-0094 §10): a validação das duas listas no painel é a da API, entrada por entrada — o erro
 * aparece no campo, nomeando a entrada, antes de ir à rede. Quem encaminha é endereço exato; o remetente
 * original é endereço ou domínio exato. ⚠️ Cópia por valor das faixas da API: os dois lados cobrem o mesmo corpus.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  PREVIEW_EMAIL_ALLOWLIST_LIMITS,
  PREVIEW_EMAIL_REASON_CODES,
} from '../../src/modules/delivery-clients/shared/previewEmail.types'
import {
  parseAllowlistText,
  validateAllowlistText,
} from '../../src/modules/delivery-clients/shared/previewEmailAllowlist.validation'

const API_CONSTANTS =
  '../api-transportada/src/cargo-receiving/domain/contractor-preview-email.constant.ts'
const API_PREVIEW_CONSTANTS = '../api-transportada/src/shared/cargo-preview.constant.ts'

describe('o texto das listas da prévia por e-mail no painel (spec 237 T4.6b)', () => {
  test('uma entrada por linha: apara, passa para minúsculas, ignora linha vazia e tira a duplicata', () => {
    expect(
      parseAllowlistText(
        '  Equipe@Transportadora.Test \n\n equipe@transportadora.test\r\nOutra@x.test',
      ),
    ).toEqual(['equipe@transportadora.test', 'outra@x.test'])
    expect(parseAllowlistText('')).toEqual([])
  })

  test.each([
    ['curta demais', 'ab', 'tooShort'],
    ['longa demais', `${'a'.repeat(252)}@x.t`, 'tooLong'],
    ['com espaço no meio', 'equipe @transportadora.test', 'forbiddenCharacter'],
    ['com vírgula', 'a@x.test,b@x.test', 'forbiddenCharacter'],
    ['entre colchetes angulares', '<equipe@transportadora.test>', 'forbiddenCharacter'],
    ['com barra vertical', 'a|b@x.test', 'forbiddenCharacter'],
    ['com caractere de controle', 'equipe@x.test\u0000', 'forbiddenCharacter'],
  ] as const)('recusa a entrada %s, nomeando-a', (_name, entry, code) => {
    const result = validateAllowlistText({
      kind: 'forwarder',
      text: `boa@transportadora.test\n${entry}`,
    })

    expect(result.issues).toEqual([{ code, entry: entry.trim().toLowerCase() }])
  })

  test('quem encaminha é endereço exato: domínio, dois arrobas e arroba solta são recusados', () => {
    const result = validateAllowlistText({
      kind: 'forwarder',
      text: 'transportadora.test\na@b@c.test\n@transportadora.test\nequipe@',
    })

    expect(result.issues.map((issue) => issue.code)).toEqual([
      'notAMailbox',
      'notAMailbox',
      'notAMailbox',
      'notAMailbox',
    ])
  })

  test('o remetente original aceita endereço ou domínio, e recusa padrão e ponto na ponta', () => {
    expect(
      validateAllowlistText({
        kind: 'sender',
        text: 'logistica@contratante.test\nContratante.Test',
      }),
    ).toEqual({ entries: ['logistica@contratante.test', 'contratante.test'], issues: [] })

    const refused = validateAllowlistText({
      kind: 'sender',
      text: '*.contratante.test\n.contratante.test\ncontratante.test.\n@contratante.test',
    })
    expect(refused.issues.map((issue) => issue.code)).toEqual([
      'notADomain',
      'notADomain',
      'notADomain',
      'notAMailbox',
    ])
  })

  test('o teto de 20 vale para entradas diferentes: o 21º é recusado, e a duplicata não conta', () => {
    const twentyOne = Array.from({ length: 21 }, (_, index) => `pessoa${index}@transportadora.test`)

    expect(validateAllowlistText({ kind: 'forwarder', text: twentyOne.join('\n') }).issues).toEqual(
      [{ code: 'tooMany', entry: '' }],
    )
    expect(
      validateAllowlistText({
        kind: 'forwarder',
        text: [...twentyOne.slice(0, 20), twentyOne[0]].join('\n'),
      }).issues,
    ).toEqual([])
  })

  test('lista vazia é válida: é o jeito de dizer "sem lista"', () => {
    expect(validateAllowlistText({ kind: 'sender', text: '  \n ' })).toEqual({
      entries: [],
      issues: [],
    })
  })
})

describe('as faixas e os motivos são os da API (spec 237 T4.6b)', () => {
  test('3 a 254 caracteres e até 20 entradas, como na API e no CHECK do banco', async () => {
    const api = await readFile(API_CONSTANTS, 'utf8')

    expect(api).toContain(`entryMaxLength: ${PREVIEW_EMAIL_ALLOWLIST_LIMITS.entryMaxLength}`)
    expect(api).toContain(`entryMinLength: ${PREVIEW_EMAIL_ALLOWLIST_LIMITS.entryMinLength}`)
    expect(api).toContain(`maxEntries: ${PREVIEW_EMAIL_ALLOWLIST_LIMITS.maxEntries}`)
  })

  test('os códigos de motivo da recusa são exatamente os do CHECK da migration', async () => {
    const source = await readFile(API_PREVIEW_CONSTANTS, 'utf8')
    const block = /CARGO_PREVIEW_EMAIL_REJECTION_CODES = \[([^\]]*)\]/u.exec(source)?.[1] ?? ''
    const apiCodes = [...block.matchAll(/'([A-Z_]+)'/gu)].map((match) => match[1])

    expect(apiCodes).toHaveLength(16)
    expect([...PREVIEW_EMAIL_REASON_CODES].sort()).toEqual([...apiCodes].sort())
  })
})
