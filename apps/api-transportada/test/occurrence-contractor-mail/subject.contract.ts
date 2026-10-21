/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T2.4 (ADR-0110 §7, D7): o assunto leva o prefixo da transportadora, que nunca é cortado nem aplicado duas
 * vezes; só a parte do modelo é cortada, e nunca abaixo de 40 caracteres.
 */
import { describe, expect, test } from 'bun:test'

import { applySubjectPrefix } from '../../src/occurrence-conversation/domain/occurrence-mail-subject.policy.js'

const CNPJ = '11444777000161'
const PREFIX = 'Tapete Mágico Transportes · CNPJ 11.444.777/0001-61 — '

function apply(subject: string, companyDisplayName = 'Tapete Mágico Transportes'): string {
  return applySubjectPrefix({ cnpj: CNPJ, companyDisplayName, subject })
}

describe('spec 272 D7: o prefixo do assunto', () => {
  test('nome de exibição, CNPJ formatado e o assunto do modelo', () => {
    expect(apply('Avaria no transporte na entrega — NF 48.213-1')).toBe(
      `${PREFIX}Avaria no transporte na entrega — NF 48.213-1`,
    )
  })

  test('assunto de 300 caracteres: o prefixo fica inteiro e o total é 200', () => {
    const subject = apply('x'.repeat(300))
    expect(subject.startsWith(PREFIX)).toBe(true)
    expect(subject).toHaveLength(200)
    expect(subject.slice(PREFIX.length)).toBe('x'.repeat(200 - PREFIX.length))
  })

  test('nome de exibição maior que 80 é cortado em 80; o prefixo nunca passa de 109', () => {
    const subject = apply('Assunto', 'N'.repeat(300))
    expect(subject.startsWith(`${'N'.repeat(80)} · CNPJ 11.444.777/0001-61 — `)).toBe(true)
    expect(subject.length - 'Assunto'.length).toBe(109)
  })

  test('nome com quebra de linha e espaços repetidos é colapsado em uma linha', () => {
    expect(apply('Assunto', 'Tapete\r\n  Mágico\tTransportes')).toBe(
      'Tapete Mágico Transportes · CNPJ 11.444.777/0001-61 — Assunto',
    )
  })

  test('assunto do modelo com quebra de linha é colapsado (saneamento da 269)', () => {
    expect(apply('Avaria\r\nNF  1')).toBe(`${PREFIX}Avaria NF 1`)
  })

  test('idempotente: assunto que já começa pelo prefixo não ganha outro (reenvio da 248, painel antigo)', () => {
    const once = apply('Avaria NF 1')
    expect(apply(once)).toBe(once)
    expect(apply(apply(once))).toBe(once)
  })

  test('idempotente também com o assunto já cortado em 200', () => {
    const once = apply('y'.repeat(300))
    expect(apply(once)).toBe(once)
  })

  test('a parte do modelo nunca fica abaixo de 40 caracteres, mesmo com CNPJ fora do padrão', () => {
    const subject = applySubjectPrefix({
      cnpj: 'Z'.repeat(120),
      companyDisplayName: 'N'.repeat(80),
      subject: 'm'.repeat(300),
    })
    expect(subject).toHaveLength(200)
    expect(subject.endsWith(` — ${'m'.repeat(40)}`)).toBe(true)
    expect(subject.startsWith(`${'N'.repeat(29)} · CNPJ `)).toBe(true)
  })

  test('o corte não parte um par substituto ao meio', () => {
    const subject = apply('😀'.repeat(300))
    expect(subject.length).toBeLessThanOrEqual(200)
    expect(subject.endsWith('😀')).toBe(true)
    expect([...subject].every((char) => char.codePointAt(0) !== 0xfffd)).toBe(true)
  })

  test('caracteres de controle e separadores de linha no nome de exibição viram espaço', () => {
    expect(apply('A', 'Tapete\u0000Mágico\u2028Transportes')).toBe(`${PREFIX}A`)
  })
})

describe('spec 272 review A4: controles e invisíveis no assunto', () => {
  test('controles e formatação (Cf) saem do assunto do modelo; tab, LF e CR viram espaço', () => {
    expect(apply('Av\u0000a\u200Bria\u202E NF\t1\u00AD\u2060\u180E\u{E0041}x\nY')).toBe(
      `${PREFIX}Avaria NF 1x Y`,
    )
  })

  test('o mesmo no nome de exibição do prefixo', () => {
    expect(apply('A', 'Tape\u200Bte\u202E Má\u2060gico')).toBe(
      'Tapete Mágico · CNPJ 11.444.777/0001-61 — A',
    )
  })
})
