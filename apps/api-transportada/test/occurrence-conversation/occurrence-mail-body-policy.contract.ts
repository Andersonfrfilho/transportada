/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T2.2 (D5): o corpo do e-mail da ocorrência é abertura + linhas de item + encerramento, com o
 * assunto numa linha só e o texto dentro dos tetos do envio.
 */
import { describe, expect, test } from 'bun:test'

import type { MailTemplateContent } from '../../src/contractor-mail/domain/mail-template-catalog.constant.js'
import { OCCURRENCE_MAIL_LIMITS } from '../../src/occurrence-conversation/domain/occurrence-conversation.constant.js'
import {
  composeOccurrenceMail,
  OCCURRENCE_MAIL_ITEM_LINES_LIMIT,
  renderOccurrenceMailPreview,
} from '../../src/occurrence-conversation/domain/occurrence-mail-body.policy.js'

const TEMPLATE: MailTemplateContent = {
  closing: 'Qualquer dúvida, responda.',
  intro: 'Olá {contratante}, nota {numero_nota}.',
  itemText: '{codigo_item} - {item} x{quantidade_item}',
  subject: 'Ocorrência {numero_nota} — {contratante}',
}

const VALUES = { contratante: 'Alfa', numero_nota: '10/1' }

function items(count: number): readonly Record<string, string>[] {
  return Array.from({ length: count }, (_, index) => ({
    codigo_item: `C${index + 1}`,
    item: `Produto ${index + 1}`,
    quantidade_item: '1',
  }))
}

describe('composeOccurrenceMail (spec 269 D5)', () => {
  test('is opening, one line per item and closing, separated by a blank line', () => {
    const mail = composeOccurrenceMail({ items: items(2), template: TEMPLATE, values: VALUES })

    expect(mail.subject).toBe('Ocorrência 10/1 — Alfa')
    expect(mail.bodyText).toBe(
      [
        'Olá Alfa, nota 10/1.',
        'C1 - Produto 1 x1\nC2 - Produto 2 x1',
        'Qualquer dúvida, responda.',
      ].join('\n\n'),
    )
  })

  test('drops the item section when the occurrence has no item', () => {
    const mail = composeOccurrenceMail({ items: [], template: TEMPLATE, values: VALUES })

    expect(mail.bodyText).toBe('Olá Alfa, nota 10/1.\n\nQualquer dúvida, responda.')
  })

  test('an empty item text prints no item line, even with items', () => {
    const mail = composeOccurrenceMail({
      items: items(3),
      template: { ...TEMPLATE, itemText: '' },
      values: VALUES,
    })

    expect(mail.bodyText).toBe('Olá Alfa, nota 10/1.\n\nQualquer dúvida, responda.')
  })

  test('an empty section disappears without leaving a blank gap', () => {
    const mail = composeOccurrenceMail({
      items: items(1),
      template: { ...TEMPLATE, closing: '', intro: '  ' },
      values: VALUES,
    })

    expect(mail.bodyText).toBe('C1 - Produto 1 x1')
  })

  test('201 items print 200 lines and "e mais 1 item"', () => {
    const mail = composeOccurrenceMail({ items: items(201), template: TEMPLATE, values: VALUES })
    const lines = mail.bodyText.split('\n')

    expect(OCCURRENCE_MAIL_ITEM_LINES_LIMIT).toBe(200)
    expect(lines).toContain('C200 - Produto 200 x1')
    expect(lines).not.toContain('C201 - Produto 201 x1')
    expect(lines).toContain('e mais 1 item')
  })

  test('202 items say "e mais 2 itens"', () => {
    const mail = composeOccurrenceMail({ items: items(202), template: TEMPLATE, values: VALUES })

    expect(mail.bodyText).toContain('e mais 2 itens')
  })

  test('a catalog variable without a value prints empty, never the raw {name}', () => {
    const mail = composeOccurrenceMail({
      items: [{ codigo_item: 'C1' }],
      template: {
        ...TEMPLATE,
        intro: 'Nota {numero_referencia} / {observacao}',
        itemText: '{item}|{valor_item}',
      },
      values: VALUES,
    })

    expect(mail.bodyText).not.toContain('{')
    expect(mail.bodyText).toContain('Nota  /')
    expect(mail.bodyText).toContain('|')
  })

  test('the item text also accepts the occurrence variables', () => {
    const mail = composeOccurrenceMail({
      items: items(1),
      template: { ...TEMPLATE, itemText: '{numero_nota}: {item}' },
      values: VALUES,
    })

    expect(mail.bodyText).toContain('10/1: Produto 1')
  })

  test('the subject collapses whitespace and line breaks into single spaces', () => {
    const mail = composeOccurrenceMail({
      items: [],
      template: { ...TEMPLATE, subject: 'Nota {numero_nota}\r\n  {contratante}' },
      values: { contratante: 'Alfa\nBcc: x@evil.test', numero_nota: '10/1' },
    })

    expect(mail.subject).toBe('Nota 10/1 Alfa Bcc: x@evil.test')
    expect(mail.subject).not.toMatch(/[\r\n]/u)
  })

  test('the subject is truncated to the send limit', () => {
    const mail = composeOccurrenceMail({
      items: [],
      template: { ...TEMPLATE, subject: '{contratante}' },
      values: { contratante: 'A'.repeat(500) },
    })

    expect(mail.subject).toHaveLength(OCCURRENCE_MAIL_LIMITS.subject)
  })

  test('the body drops item lines, with "e mais N itens", to fit the send limit', () => {
    const longItems = Array.from({ length: 200 }, (_, index) => ({
      codigo_item: `C${index + 1}`,
      item: 'P'.repeat(100),
      quantidade_item: '1',
    }))
    const mail = composeOccurrenceMail({ items: longItems, template: TEMPLATE, values: VALUES })

    expect(mail.bodyText.length).toBeLessThanOrEqual(OCCURRENCE_MAIL_LIMITS.body)
    expect(mail.bodyText).toMatch(/e mais \d+ itens\n\nQualquer dúvida, responda\.$/u)
    expect(mail.bodyText.startsWith('Olá Alfa, nota 10/1.')).toBe(true)
  })

  test('an opening that alone exceeds the limit is cut at the limit', () => {
    const mail = composeOccurrenceMail({
      items: items(1),
      template: { ...TEMPLATE, intro: 'x'.repeat(OCCURRENCE_MAIL_LIMITS.body + 50) },
      values: VALUES,
    })

    expect(mail.bodyText.length).toBeLessThanOrEqual(OCCURRENCE_MAIL_LIMITS.body)
  })

  test('values come out literal in the text (escaping is the HTML builder job)', () => {
    const mail = composeOccurrenceMail({
      items: [],
      template: { ...TEMPLATE, intro: '{observacao}' },
      values: { observacao: '<b>&</b>' },
    })

    expect(mail.bodyText).toContain('<b>&</b>')
  })
})

describe('renderOccurrenceMailPreview (spec 269)', () => {
  test('renders the sample with the signature and escapes the markup', () => {
    const preview = renderOccurrenceMailPreview({
      ...TEMPLATE,
      intro: 'Olá {contratante} <script>',
    })

    expect(preview.subject).toContain('Contratante Exemplo')
    expect(preview.html).toContain('&lt;script&gt;')
    expect(preview.html).not.toContain('<script>')
    expect(preview.text).toContain('--')
  })
})
