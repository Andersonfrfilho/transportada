/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T7.3 (RF25, RF27): os modelos das contas são arquivos versionados, passam na régua, entram no publicador e
 * renderizam com o valor escapado. O layout é do modelo; o código só monta valores e o HTML do sistema.
 */
import { describe, expect, test } from 'bun:test'

import {
  EXPENSE_DAILY_SUMMARY_TEMPLATE_KEY,
  EXPENSE_REMINDER_TEMPLATE_KEY,
} from '../../src/expenses/domain/expense-reminder-mail-template.constant.js'
import {
  assessExpenseMailTemplate,
  assessExpenseWhatsappTemplate,
  blocksExpenseTemplateSend,
} from '../../src/expenses/domain/expense-reminder-mail-template.policy.js'
import {
  buildExpenseDailySummaryValues,
  buildExpenseMailButtonHtml,
  buildExpenseReminderValues,
  buildExpenseSummaryTableHtml,
  describeDueSituation,
  formatBrl,
  renderExpenseDailySummaryMail,
  renderExpenseReminderMail,
  renderExpenseWhatsappText,
} from '../../src/expenses/domain/expense-reminder-mail.policy.js'
import {
  planOccurrenceMailTemplatePublication,
  readExpenseTemplateFiles,
} from '../../src/occurrence-conversation/application/occurrence-mail-templates-publish.service.js'

const files = readExpenseTemplateFiles()
const fileOf = (key: string, channel: 'email' | 'whatsapp') => {
  const file = files.find(
    (candidate) => candidate.key === key && (candidate.channel ?? 'email') === channel,
  )
  if (file === undefined) throw new Error(`sem ${channel}:${key}`)
  return file
}

const FACTS = {
  amount: '1234.5',
  categoryName: 'Aluguel',
  competence: '2026-11',
  companyDisplayName: 'Transportes Exemplo',
  dueDate: '2026-11-13',
  expenseName: 'Aluguel do galpão <b>',
  payeeName: null,
  recipientName: 'Ana & Cia',
  today: '2026-11-10',
}

describe('os arquivos dos modelos das contas (spec 325 T7.3)', () => {
  test('três modelos: aviso em e-mail e WhatsApp, resumo em e-mail', () => {
    expect(files.map((file) => `${file.channel ?? 'email'}:${file.key}`).sort()).toEqual([
      'email:contas.aviso-vencimento',
      'email:contas.resumo-diario',
      'whatsapp:contas.aviso-vencimento',
    ])
  })

  test('todos passam na régua e o publicador os aceita', () => {
    for (const file of files) {
      const problems =
        file.channel === 'whatsapp'
          ? assessExpenseWhatsappTemplate({ body: file.body, key: file.key })
          : assessExpenseMailTemplate({ key: file.key, template: file })
      expect({ key: file.key, problems }).toEqual({ key: file.key, problems: [] })
    }
    const plan = planOccurrenceMailTemplatePublication({
      active: new Map(),
      overwrite: [],
      templates: files,
    })
    expect(plan.invalid).toEqual([])
    expect(plan.entries.map((entry) => entry.verdict)).toEqual(['create', 'create', 'create'])
  })
})

describe('a régua dos modelos das contas (spec 325 T7.3)', () => {
  const reminder = fileOf(EXPENSE_REMINDER_TEMPLATE_KEY, 'email')

  test('variável de outro modelo é desconhecida; sem área de mensagem, sem assunto e chave estranha recusam', () => {
    const codes = (body: string, subject = reminder.subject, key = EXPENSE_REMINDER_TEMPLATE_KEY) =>
      assessExpenseMailTemplate({ key, template: { body, subject } }).map((p) => p.code)
    expect(
      assessExpenseMailTemplate({
        key: EXPENSE_REMINDER_TEMPLATE_KEY,
        template: { body: `${reminder.body}{{tabelaContas}}{{numeroNota}}`, subject: 'x' },
      }),
    ).toEqual([{ code: 'unknown_variables', variables: ['tabelaContas', 'numeroNota'] }])
    expect(codes(reminder.body.replace('<!-- mensagem -->', ''))).toEqual(['missing_message_area'])
    expect(codes(reminder.body, '  ')).toEqual(['empty_subject'])
    expect(codes(reminder.body, 'x', 'contas.outra')).toEqual(['unknown_key'])
    expect(codes(`${reminder.body}<script>x</script>`)).toEqual(['unsafe_html'])
  })

  test('o botão do sistema dentro da área de mensagem é inseguro (sairia escapado na edição)', () => {
    const body = reminder.body.replace('<!-- /mensagem -->', '{{botaoJaPaguei}}<!-- /mensagem -->')
    expect(
      assessExpenseMailTemplate({
        key: EXPENSE_REMINDER_TEMPLATE_KEY,
        template: { body, subject: 'x' },
      }),
    ).toEqual([{ code: 'unsafe_html' }])
  })

  test('WhatsApp não aceita HTML nem variável de e-mail; no envio, variável desconhecida não bloqueia', () => {
    const problems = assessExpenseWhatsappTemplate({
      body: '<b>{{conta}}</b> {{botaoJaPaguei}}',
      key: EXPENSE_REMINDER_TEMPLATE_KEY,
    })
    expect(problems).toEqual([
      { code: 'html_not_allowed' },
      { code: 'unknown_variables', variables: ['botaoJaPaguei'] },
    ])
    expect(blocksExpenseTemplateSend([{ code: 'unknown_variables', variables: ['x'] }])).toBe(false)
    expect(blocksExpenseTemplateSend([{ code: 'not_found' }])).toBe(true)
    expect(
      assessExpenseWhatsappTemplate({ body: null, key: EXPENSE_REMINDER_TEMPLATE_KEY }),
    ).toEqual([{ code: 'not_found' }])
  })
})

describe('a renderização (spec 325 T7.3)', () => {
  test('frases do prazo e dinheiro em texto', () => {
    expect([3, 1, 0, -1, -2].map(describeDueSituation)).toEqual([
      'vence em 3 dias',
      'vence amanhã',
      'vence hoje',
      'venceu ontem',
      'venceu há 2 dias',
    ])
    expect(formatBrl('1234567.8')).toBe('R$ 1.234.567,80')
    expect(formatBrl('0')).toBe('R$ 0,00')
    expect(() => formatBrl('1.234')).toThrow()
  })

  test('o aviso sai com o valor escapado, os botões crus e o texto puro junto', () => {
    const rendered = renderExpenseReminderMail({
      systemHtml: {
        botaoAbrirContas: buildExpenseMailButtonHtml({
          label: 'Abrir Contas',
          primary: false,
          url: 'https://painel.exemplo.com.br/contas',
        }),
        botaoJaPaguei: buildExpenseMailButtonHtml({
          label: 'Já paguei',
          primary: true,
          url: 'https://api.exemplo.com.br/x?t=a&b',
        }),
      },
      template: fileOf(EXPENSE_REMINDER_TEMPLATE_KEY, 'email'),
      values: buildExpenseReminderValues(FACTS),
    })
    expect(rendered.subject).toBe('Aluguel do galpão <b> vence em 3 dias — R$ 1.234,50')
    expect(rendered.html).toContain('Aluguel do galpão &lt;b&gt;')
    expect(rendered.html).toContain('Olá, Ana &amp; Cia,')
    expect(rendered.html).toContain('href="https://api.exemplo.com.br/x?t=a&amp;b"')
    expect(rendered.html).toContain('>Já paguei</a>')
    expect(rendered.html).toContain('13/11/2026')
    expect(rendered.html).toContain('11/2026')
    expect(rendered.html).toContain('—')
    expect(rendered.html).not.toContain('{{')
    expect(rendered.text).toContain('Já paguei')
    expect(rendered.text).not.toContain('<td')
  })

  test('sem link (ou link que não é https) o botão some, sem buraco', () => {
    expect(buildExpenseMailButtonHtml({ label: 'x', primary: true, url: null })).toBe('')
    expect(buildExpenseMailButtonHtml({ label: 'x', primary: true, url: 'javascript:x' })).toBe('')
    const rendered = renderExpenseReminderMail({
      systemHtml: {},
      template: fileOf(EXPENSE_REMINDER_TEMPLATE_KEY, 'email'),
      values: buildExpenseReminderValues(FACTS),
    })
    expect(rendered.html).not.toContain('<a ')
  })

  test('o valor nunca é reinterpretado como variável', () => {
    const rendered = renderExpenseReminderMail({
      systemHtml: {},
      template: fileOf(EXPENSE_REMINDER_TEMPLATE_KEY, 'email'),
      values: buildExpenseReminderValues({ ...FACTS, expenseName: '{{botaoJaPaguei}}' }),
    })
    expect(rendered.html).toContain('{{botaoJaPaguei}}')
  })

  test('o resumo soma em centavos e lista cada conta com a situação', () => {
    const lines = [
      { amount: '1000.10', dueDate: '2026-11-10', expenseName: 'Energia' },
      { amount: '0.20', dueDate: '2026-11-08', expenseName: 'Água & esgoto' },
    ]
    const rendered = renderExpenseDailySummaryMail({
      systemHtml: { tabelaContas: buildExpenseSummaryTableHtml({ lines, today: FACTS.today }) },
      template: fileOf(EXPENSE_DAILY_SUMMARY_TEMPLATE_KEY, 'email'),
      values: buildExpenseDailySummaryValues({
        companyDisplayName: 'Transportes Exemplo',
        lines,
        recipientName: 'Ana',
        today: FACTS.today,
      }),
    })
    expect(rendered.subject).toBe('Contas de hoje: 2 contas — R$ 1.000,30 em aberto')
    expect(rendered.html).toContain('Água &amp; esgoto')
    expect(rendered.html).toContain('10/11/2026 · vence hoje')
    expect(rendered.html).toContain('08/11/2026 · venceu há 2 dias')
    expect(
      buildExpenseDailySummaryValues({
        companyDisplayName: 'x',
        lines: [lines[0] as (typeof lines)[number]],
        recipientName: 'Ana',
        today: FACTS.today,
      }).quantidade,
    ).toBe('1 conta')
  })

  test('o WhatsApp sai com o valor cru e o pedido de "paguei"', () => {
    const text = renderExpenseWhatsappText({
      body: fileOf(EXPENSE_REMINDER_TEMPLATE_KEY, 'whatsapp').body,
      values: buildExpenseReminderValues(FACTS),
    })
    expect(text).toContain('*Aluguel do galpão <b>* vence em 3 dias')
    expect(text).toContain('R$ 1.234,50')
    expect(text).toContain('responda *paguei*')
    expect(text).not.toContain('{{')
  })
})
