/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T2.3 (ADR-0108, D6): o assunto e o corpo do e-mail à contratante a partir do modelo do módulo.
 */
import { describe, expect, test } from 'bun:test'

import { OCCURRENCE_MAIL_LIMITS } from '../../src/occurrence-conversation/domain/occurrence-conversation.constant.js'
import { renderContractorMail } from '../../src/occurrence-conversation/domain/occurrence-contractor-mail-render.policy.js'

const VALUES = { contratante: 'Alfa', numeroNota: '123/1', observacao: 'Avaria' }

describe('spec 271: renderização do e-mail à contratante', () => {
  test('troca {{campo}} pelo valor, com espaços tolerados', () => {
    const mail = renderContractorMail({
      bodyTemplate: 'Olá {{ contratante }}, nota {{numeroNota}}.',
      itemLines: [],
      subjectTemplate: 'Nota {{numeroNota}}',
      values: VALUES,
    })

    expect(mail).toEqual({ bodyText: 'Olá Alfa, nota 123/1.', subject: 'Nota 123/1' })
  })

  test('variável ausente sai vazia, nunca o marcador cru', () => {
    const mail = renderContractorMail({
      bodyTemplate: 'Ref: [{{numeroReferencia}}]',
      itemLines: [],
      subjectTemplate: 'Assunto {{somaItens}}',
      values: VALUES,
    })

    expect(mail).toEqual({ bodyText: 'Ref: []', subject: 'Assunto' })
  })

  test('assunto com quebra de linha colapsa em espaço e é aparado', () => {
    const mail = renderContractorMail({
      bodyTemplate: 'x',
      itemLines: [],
      subjectTemplate: '  Nota\n{{observacao}}\r\n\tfim  ',
      values: { observacao: 'a\nb' },
    })

    expect(mail.subject).toBe('Nota a b fim')
  })

  test('assunto longo é truncado no teto do banco', () => {
    const mail = renderContractorMail({
      bodyTemplate: 'x',
      itemLines: [],
      subjectTemplate: '{{observacao}}',
      values: { observacao: 'a'.repeat(500) },
    })

    expect(mail.subject).toHaveLength(OCCURRENCE_MAIL_LIMITS.subject)
  })

  test('{{linhasItens}} imprime uma linha por item', () => {
    const mail = renderContractorMail({
      bodyTemplate: 'Itens:\n{{linhasItens}}\nfim',
      itemLines: ['A – 1', 'B – 2'],
      subjectTemplate: 's',
      values: VALUES,
    })

    expect(mail.bodyText).toBe('Itens:\nA – 1\nB – 2\nfim')
  })

  test('sem itens, {{linhasItens}} sai vazio', () => {
    const mail = renderContractorMail({
      bodyTemplate: 'Itens:[{{linhasItens}}]',
      itemLines: [],
      subjectTemplate: 's',
      values: VALUES,
    })

    expect(mail.bodyText).toBe('Itens:[]')
  })

  test('mais de 200 itens: 200 linhas e "e mais N itens"', () => {
    const itemLines = Array.from({ length: 203 }, (_, index) => `item ${index}`)
    const mail = renderContractorMail({
      bodyTemplate: '{{linhasItens}}',
      itemLines,
      subjectTemplate: 's',
      values: VALUES,
    })
    const printed = mail.bodyText.split('\n')

    expect(printed).toHaveLength(201)
    expect(printed[199]).toBe('item 199')
    expect(printed[200]).toBe('e mais 3 itens')
  })

  test('corpo longo encurta as linhas de item antes de truncar o texto do modelo', () => {
    const itemLines = Array.from({ length: 200 }, (_, index) => `${index} ${'x'.repeat(60)}`)
    const mail = renderContractorMail({
      bodyTemplate: 'Início do aviso.\n\n{{linhasItens}}\n\nQualquer dúvida, responda.',
      itemLines,
      subjectTemplate: 's',
      values: VALUES,
    })

    expect(mail.bodyText.length).toBeLessThanOrEqual(OCCURRENCE_MAIL_LIMITS.body)
    expect(mail.bodyText.startsWith('Início do aviso.')).toBe(true)
    expect(mail.bodyText.endsWith('Qualquer dúvida, responda.')).toBe(true)
    expect(mail.bodyText).toMatch(/e mais \d+ itens/u)
  })

  test('corpo sem itens que passa do teto é truncado', () => {
    const mail = renderContractorMail({
      bodyTemplate: '{{observacao}}',
      itemLines: [],
      subjectTemplate: 's',
      values: { observacao: 'a'.repeat(9000) },
    })

    expect(mail.bodyText).toHaveLength(OCCURRENCE_MAIL_LIMITS.body)
  })

  test('texto puro: nada é escapado como HTML', () => {
    const mail = renderContractorMail({
      bodyTemplate: '{{observacao}}',
      itemLines: [],
      subjectTemplate: '{{observacao}}',
      values: { observacao: 'A & B <c> "d"' },
    })

    expect(mail).toEqual({ bodyText: 'A & B <c> "d"', subject: 'A & B <c> "d"' })
  })
})
