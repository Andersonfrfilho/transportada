/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (ADR-0094 §10): as duas listas da entrada por e-mail são normalizadas e conferidas ANTES do
 * banco, com as mesmas regras do CHECK (3–254 caracteres, sem controle, espaço, vírgula, `<>` ou `|`, até 20).
 * Quem encaminha é endereço exato; o remetente original é endereço ou domínio exato, nunca padrão.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { normalizePreviewAllowlist } from '../../src/cargo-receiving/domain/preview-email-allowlist.policy.js'

describe('a normalização das listas da prévia por e-mail (spec 237 T4.6b)', () => {
  test('apara, passa para minúsculas e tira a duplicata, na ordem de entrada', () => {
    const result = normalizePreviewAllowlist({
      entries: [
        '  Equipe@Transportadora.Test ',
        'equipe@transportadora.test',
        'outra@transportadora.test',
      ],
      kind: 'forwarder',
    })

    expect(result).toEqual({
      entries: ['equipe@transportadora.test', 'outra@transportadora.test'],
      hasTooManyEntries: false,
      issues: [],
    })
  })

  test.each([
    ['curta demais', 'ab', 'tooShort'],
    ['longa demais', `${'a'.repeat(252)}@x.t`, 'tooLong'],
    ['com espaço no meio', 'equipe @transportadora.test', 'forbiddenCharacter'],
    ['com vírgula', 'a@x.test,b@x.test', 'forbiddenCharacter'],
    ['entre colchetes angulares', '<equipe@transportadora.test>', 'forbiddenCharacter'],
    ['com barra vertical', 'a|b@x.test', 'forbiddenCharacter'],
    ['com caractere de controle', 'equipe@x.test\u0000', 'forbiddenCharacter'],
    ['com quebra de linha', 'equipe@x.test\nbcc@x.test', 'forbiddenCharacter'],
  ] as const)('recusa a entrada %s, apontando o índice e a entrada', (_name, entry, reason) => {
    const result = normalizePreviewAllowlist({
      entries: ['boa@transportadora.test', entry],
      kind: 'forwarder',
    })

    expect(result.issues).toEqual([{ entry: entry.trim().toLowerCase(), index: 1, reason }])
  })

  test('quem encaminha é endereço exato: domínio, dois arrobas e arroba solta são recusados', () => {
    const issues = normalizePreviewAllowlist({
      entries: ['transportadora.test', 'a@b@c.test', '@transportadora.test', 'equipe@'],
      kind: 'forwarder',
    }).issues

    expect(issues.map((issue) => [issue.index, issue.reason])).toEqual([
      [0, 'notAMailbox'],
      [1, 'notAMailbox'],
      [2, 'notAMailbox'],
      [3, 'notAMailbox'],
    ])
  })

  test('o remetente original aceita endereço ou domínio, e recusa padrão, subdomínio coringa e ponto na ponta', () => {
    const accepted = normalizePreviewAllowlist({
      entries: ['logistica@contratante.test', 'Contratante.Test'],
      kind: 'sender',
    })
    expect(accepted.issues).toEqual([])
    expect(accepted.entries).toEqual(['logistica@contratante.test', 'contratante.test'])

    const refused = normalizePreviewAllowlist({
      entries: [
        '*.contratante.test',
        '.contratante.test',
        'contratante.test.',
        '@contratante.test',
      ],
      kind: 'sender',
    })
    expect(refused.issues.map((issue) => issue.index)).toEqual([0, 1, 2, 3])
  })

  /**
   * Revisão de segurança (L1, L3): o CHECK do banco conta CARACTERES e o JS contava unidades UTF-16 (`"a😀"` valia 3 aqui e
   * 2 lá: a API aceitava e o upsert estourava 23514); e homógrafo, caractere invisível e bidi passavam. Só ASCII visível entra.
   */
  test.each([
    ['emoji (2 caracteres no banco, 3 em UTF-16)', 'a😀', 'nonAscii'],
    ['homógrafo cirílico (а de acme)', 'аcme.com', 'nonAscii'],
    ['zero-width no meio do domínio', 'a​cme.com', 'nonAscii'],
    ['bidi (RLO) no fim do domínio', 'acme.com‮', 'nonAscii'],
    ['acento (IDN sem punycode)', 'pão.example.test', 'nonAscii'],
  ] as const)('recusa %s, nos dois tipos de lista', (_name, entry, reason) => {
    for (const kind of ['forwarder', 'sender'] as const) {
      const text = kind === 'forwarder' ? `x@${entry}` : entry
      const result = normalizePreviewAllowlist({ entries: [text], kind })

      expect(result.entries).toEqual([])
      expect(result.issues).toEqual([{ entry: text.toLowerCase(), index: 0, reason }])
    }
  })

  test('domínio internacional entra em punycode (xn--), que é ASCII', () => {
    expect(
      normalizePreviewAllowlist({ entries: ['xn--po-1ma.example.test'], kind: 'sender' }),
    ).toEqual({ entries: ['xn--po-1ma.example.test'], hasTooManyEntries: false, issues: [] })
  })

  test('o piso e o teto de caracteres são medidos em pontos de código, como o banco', () => {
    const source = readFileSync(
      new URL(
        '../../src/cargo-receiving/domain/preview-email-allowlist.policy.ts',
        import.meta.url,
      ),
      'utf8',
    )

    expect(source).toContain('[...entry].length')
    expect(source).toContain('/^[\\x21-\\x7e]+$/u')
  })

  test('o teto de 20 vale depois de tirar as duplicatas', () => {
    const twentyOne = Array.from({ length: 21 }, (_, index) => `pessoa${index}@transportadora.test`)

    expect(
      normalizePreviewAllowlist({ entries: twentyOne, kind: 'forwarder' }).hasTooManyEntries,
    ).toBe(true)
    expect(
      normalizePreviewAllowlist({
        entries: [...twentyOne.slice(0, 20), twentyOne[0]!],
        kind: 'forwarder',
      }).hasTooManyEntries,
    ).toBe(false)
  })

  test('lista vazia é válida: é o jeito de dizer "sem lista"', () => {
    expect(normalizePreviewAllowlist({ entries: [], kind: 'sender' })).toEqual({
      entries: [],
      hasTooManyEntries: false,
      issues: [],
    })
  })
})
